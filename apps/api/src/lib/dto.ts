/**
 * Response shapes that apps/api needs but that do not exist in @itmc/core api-types.ts.
 *
 * NOTE: `QuizQuestionPublic` is declared in packages/api-client/src/index.ts (the client cannot be
 * imported here — apps/api may only depend on @itmc/db and @itmc/core, see ARCHITECTURE.md §3), so
 * it is mirrored locally. Keep the two structurally identical. If api-types.ts ever gains these
 * DTOs, delete this file and import them instead.
 */
import type { Flashcard, QuizQuestion } from '@itmc/core';

/** A quiz question as sent to the client: `answer` and `explanation` are withheld until answered. */
export type QuizQuestionPublic = Omit<QuizQuestion, 'answer' | 'explanation'>;

export interface StartQuizResponse {
  sessionId: string;
  questions: QuizQuestionPublic[];
}

export interface AnswerQuizResponse {
  correct: boolean;
  answer: number[];
  explanation: string;
}

export interface FinishQuizResponse {
  correctCount: number;
  totalCount: number;
}

export interface ReviewCardResponse {
  dueAt: string;
}

export type DueCardsResponse = Flashcard[];

export interface ExerciseAttemptResponse {
  id: string;
}

export interface HealthResponse {
  ok: true;
  contentVersion: string;
  uptime: number;
}

/** Strip the fields the client must not see before it has answered. */
export function toPublicQuestion(q: QuizQuestion): QuizQuestionPublic {
  const { answer: _answer, explanation: _explanation, ...rest } = q;
  return rest;
}
