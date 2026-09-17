/**
 * Typed HTTP client for apps/api. Uses only the global `fetch` so it runs in browsers, React Native
 * and Node. Web wraps these in TanStack Query hooks; mobile will do the same.
 *
 * Every route in docs/ARCHITECTURE.md section 7 has a method here. When a route is added, add its
 * method here too: name it `${verb}${Resource}` and return the DTO type from @itmc/core api-types.ts.
 */
import type {
  AnswerQuizInput,
  ContentManifest,
  DashboardDTO,
  ExerciseAttemptInput,
  Flashcard,
  Lesson,
  LessonProgressDTO,
  QuizQuestion,
  ReviewCardInput,
  StartQuizInput,
  TopicSettings,
  UserSettings,
} from '@itmc/core';

export interface ApiClientOptions {
  baseUrl: string;
  /** Called per request so tokens can rotate / be read from secure storage on mobile. */
  getToken: () => string | undefined | Promise<string | undefined>;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

/** A quiz question as sent to the client: answer and explanation are withheld until answered. */
export type QuizQuestionPublic = Omit<QuizQuestion, 'answer' | 'explanation'>;

export function createApiClient(opts: ApiClientOptions) {
  const f = opts.fetchImpl ?? fetch;
  const enc = encodeURIComponent;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await opts.getToken();
    // Only declare a JSON content-type when there is actually a JSON body. A bodyless POST that
    // claims `application/json` is rejected by strict servers and proxies. The API tolerates it as
    // well, but the request should be correct at source.
    const hasBody = body !== undefined;
    const res = await f(`${opts.baseUrl}${path}`, {
      method,
      headers: {
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: hasBody ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, `${method} ${path} -> ${res.status}`, parsed);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  return {
    // content
    getManifest: () => call<ContentManifest>('GET', '/api/content/manifest'),
    getLesson: (lessonId: string) => call<Lesson>('GET', `/api/content/lessons/${enc(lessonId)}`),
    getTopicQuestions: (topicId: string) => call<QuizQuestion[]>('GET', `/api/content/topics/${enc(topicId)}/questions`),
    getTopicFlashcards: (topicId: string) => call<Flashcard[]>('GET', `/api/content/topics/${enc(topicId)}/flashcards`),

    // settings
    getUserSettings: () => call<UserSettings>('GET', '/api/settings'),
    putUserSettings: (b: UserSettings) => call<UserSettings>('PUT', '/api/settings', b),
    getTopicSettings: () => call<TopicSettings[]>('GET', '/api/settings/topics'),
    putTopicSettings: (b: TopicSettings) => call<TopicSettings>('PUT', `/api/settings/topics/${enc(b.topicId)}`, b),

    // progress
    getDashboard: () => call<DashboardDTO>('GET', '/api/progress/dashboard'),
    getLessonProgress: (lessonId: string) => call<LessonProgressDTO>('GET', `/api/progress/lessons/${enc(lessonId)}`),
    markLessonViewed: (lessonId: string) => call<LessonProgressDTO>('POST', `/api/progress/lessons/${enc(lessonId)}/viewed`),
    completeSection: (lessonId: string, sectionId: string) =>
      call<LessonProgressDTO>('POST', `/api/progress/lessons/${enc(lessonId)}/sections`, { sectionId }),
    submitExercise: (b: ExerciseAttemptInput) => call<{ id: string }>('POST', '/api/progress/exercises', b),

    // review
    startQuiz: (b: StartQuizInput) => call<{ sessionId: string; questions: QuizQuestionPublic[] }>('POST', '/api/review/quiz', b),
    answerQuiz: (sessionId: string, b: AnswerQuizInput) =>
      call<{ correct: boolean; answer: number[]; explanation: string }>('POST', `/api/review/quiz/${enc(sessionId)}/answers`, b),
    finishQuiz: (sessionId: string) =>
      call<{ correctCount: number; totalCount: number }>('POST', `/api/review/quiz/${enc(sessionId)}/finish`),
    getDueCards: (limit = 20, topicId?: string) =>
      call<Flashcard[]>('GET', `/api/review/cards/due?limit=${limit}${topicId ? `&topicId=${enc(topicId)}` : ''}`),
    reviewCard: (b: ReviewCardInput) => call<{ dueAt: string }>('POST', '/api/review/cards', b),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
