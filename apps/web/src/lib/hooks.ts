/**
 * TanStack Query hooks: one per api-client method, plus the two composed hooks the reading screen
 * needs (useTopicView, useLessonView).
 *
 * Query keys: ['manifest'], ['lesson', id], ['progress', id], ['dashboard'], ['settings'],
 * ['topicSettings'], ['questions', topicId], ['flashcards', topicId], ['dueCards', limit, topicId].
 *
 * Invalidation contract:
 *   completeSection  -> writes ['progress', id] from the response, invalidates ['dashboard']
 *   submitExercise   -> invalidates ['dashboard']
 *   putTopicSettings -> optimistic write of ['topicSettings'], invalidates ['dashboard']
 *   putUserSettings  -> writes ['settings'], invalidates ['dashboard']
 *   reviewCard       -> invalidates ['dueCards'] and ['dashboard']
 *   finishQuiz       -> invalidates ['dashboard']
 *
 * Content queries are immutable per deploy, so they are staleTime: Infinity.
 */
import type {
  AnswerQuizInput,
  ExerciseAttemptInput,
  Level,
  Mode,
  ReviewCardInput,
  StartQuizInput,
  TopicSettings,
  UserSettings,
} from '@itmc/core';
import { lessonId } from '@itmc/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { api } from './api';
import {
  DEFAULT_USER_SETTINGS,
  mergeLocalTopicSetting,
  readLocalTopicSettings,
  readLocalUserSettings,
  writeLocalTopicSettings,
  writeLocalUserSettings,
} from './local-settings';
import { resolveTopicView } from './view-model';

// ---------------------------------------------------------------- content (implemented routes)

export const useManifest = () => useQuery({ queryKey: ['manifest'], queryFn: api.getManifest, staleTime: Infinity });

export const useLesson = (id: string | undefined) =>
  useQuery({ queryKey: ['lesson', id], queryFn: () => api.getLesson(id!), enabled: !!id, staleTime: Infinity });

export const useTopicQuestions = (topicId: string | undefined) =>
  useQuery({
    queryKey: ['questions', topicId],
    queryFn: () => api.getTopicQuestions(topicId!),
    enabled: !!topicId,
    staleTime: Infinity,
  });

export const useTopicFlashcards = (topicId: string | undefined) =>
  useQuery({
    queryKey: ['flashcards', topicId],
    queryFn: () => api.getTopicFlashcards(topicId!),
    enabled: !!topicId,
    staleTime: Infinity,
  });

// ---------------------------------------------------------------- settings

export const useUserSettings = () => useQuery({ queryKey: ['settings'], queryFn: api.getUserSettings });

export const useTopicSettings = () => useQuery({ queryKey: ['topicSettings'], queryFn: api.getTopicSettings });

export function usePutUserSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UserSettings) => api.putUserSettings(b),
    onMutate: (b) => {
      writeLocalUserSettings(b);
      qc.setQueryData(['settings'], b);
    },
    onSuccess: (data) => {
      writeLocalUserSettings(data);
      qc.setQueryData(['settings'], data);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Optimistic: the toolbar must respond instantly, the write is a background detail. */
export function usePutTopicSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: TopicSettings) => api.putTopicSettings(b),
    onMutate: (b) => {
      mergeLocalTopicSetting(b);
      const previous = qc.getQueryData<TopicSettings[]>(['topicSettings']);
      qc.setQueryData<TopicSettings[]>(['topicSettings'], (old) => [
        ...(old ?? []).filter((t) => t.topicId !== b.topicId),
        b,
      ]);
      return { previous };
    },
    onSuccess: (data) => {
      mergeLocalTopicSetting(data);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ---------------------------------------------------------------- progress

export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: api.getDashboard });

export const useLessonProgress = (id: string | undefined) =>
  useQuery({ queryKey: ['progress', id], queryFn: () => api.getLessonProgress(id!), enabled: !!id });

/** Fire-and-forget on entering a lesson. A failure here must never surface: it is not the user's task. */
export function useMarkLessonViewed(id: string | undefined, enabled = true) {
  const qc = useQueryClient();
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!id || !enabled || seen.current === id) return;
    seen.current = id;
    api
      .markLessonViewed(id)
      .then((row) => {
        qc.setQueryData(['progress', id], row);
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .catch(() => undefined);
  }, [id, enabled, qc]);
}

export function useCompleteSection(lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => api.completeSection(lessonId, sectionId),
    onSuccess: (data) => {
      qc.setQueryData(['progress', lessonId], data);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useSubmitExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: ExerciseAttemptInput) => api.submitExercise(b),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });
}

// ---------------------------------------------------------------- review

export const useDueCards = (limit = 20, topicId?: string) =>
  useQuery({ queryKey: ['dueCards', limit, topicId ?? null], queryFn: () => api.getDueCards(limit, topicId) });

export function useReviewCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: ReviewCardInput) => api.reviewCard(b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dueCards'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useStartQuiz = () => useMutation({ mutationFn: (b: StartQuizInput) => api.startQuiz(b) });

export const useAnswerQuiz = (sessionId: string) =>
  useMutation({ mutationFn: (b: AnswerQuizInput) => api.answerQuiz(sessionId, b) });

export function useFinishQuiz(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.finishQuiz(sessionId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });
}

// ---------------------------------------------------------------- composed

export interface SettingsView {
  user: UserSettings;
  topics: TopicSettings[];
  /** True when the values came from the API rather than the local mirror. */
  live: boolean;
  loading: boolean;
}

/**
 * User + topic settings with a local fallback. If the settings routes are not up yet the app still
 * has a coherent level and mode rather than a blank screen.
 */
export function useSettingsView(): SettingsView {
  const user = useUserSettings();
  const topics = useTopicSettings();

  useEffect(() => {
    if (user.data) writeLocalUserSettings(user.data);
  }, [user.data]);
  useEffect(() => {
    if (topics.data) writeLocalTopicSettings(topics.data);
  }, [topics.data]);

  return {
    user: user.data ?? (user.isPending ? DEFAULT_USER_SETTINGS : readLocalUserSettings()),
    topics: topics.data ?? (topics.isPending ? [] : readLocalTopicSettings()),
    live: !!user.data && !!topics.data,
    loading: user.isPending || topics.isPending,
  };
}

export interface TopicView {
  level: Level;
  mode: Mode;
  setLevel: (l: Level) => void;
  setMode: (m: Mode) => void;
  /** True while a change is in flight; false with `saveFailed` when the settings route is down. */
  saving: boolean;
  saveFailed: boolean;
  settingsLoading: boolean;
}

/** The (level, mode) pair for one topic, resolved against user defaults, with persistence. */
export function useTopicView(topicId: string | undefined): TopicView {
  const settings = useSettingsView();
  const put = usePutTopicSettings();
  const resolved = resolveTopicView(topicId ?? '', settings.user, settings.topics);

  const save = useCallback(
    (next: { level: Level; mode: Mode }) => {
      if (!topicId) return;
      put.mutate({ topicId, ...next });
    },
    [put, topicId],
  );

  return {
    level: resolved.level,
    mode: resolved.mode,
    setLevel: (level) => save({ level, mode: resolved.mode }),
    setMode: (mode) => save({ level: resolved.level, mode }),
    saving: put.isPending,
    saveFailed: put.isError,
    settingsLoading: settings.loading,
  };
}

/** Everything TopicPage needs for the currently selected level. */
export function useLessonView(topicId: string | undefined, level: Level) {
  const id = topicId ? lessonId(topicId, level) : undefined;
  const lesson = useLesson(id);
  const progress = useLessonProgress(id);
  // Nothing was read if the lesson has not been written, so nothing is recorded.
  useMarkLessonViewed(id, !!lesson.data && lesson.data.status !== 'stub');
  return { lessonId: id, lesson, progress };
}
