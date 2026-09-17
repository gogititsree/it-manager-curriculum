/** ULID factory for every event-shaped row (attempts, sessions, answers, activity events). */
import { ulid } from 'ulid';

export const newId = (): string => ulid();
