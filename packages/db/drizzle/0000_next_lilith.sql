CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`ref_id` text,
	`payload` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ae_user_created` ON `activity_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `card_reviews` (
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`ease` real NOT NULL,
	`interval_days` integer NOT NULL,
	`reps` integer NOT NULL,
	`lapses` integer NOT NULL,
	`due_at` text NOT NULL,
	`last_reviewed_at` text,
	`last_rating` integer,
	PRIMARY KEY(`user_id`, `card_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cr_user_due` ON `card_reviews` (`user_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `exercise_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`submission` text,
	`self_rating` integer NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ea_user_exercise` ON `exercise_attempts` (`user_id`,`exercise_id`);--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`status` text NOT NULL,
	`completed_sections` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`last_viewed_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `lesson_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lp_user_viewed` ON `lesson_progress` (`user_id`,`last_viewed_at`);--> statement-breakpoint
CREATE TABLE `quiz_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`question_id` text NOT NULL,
	`chosen` text NOT NULL,
	`correct` integer NOT NULL,
	`answered_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `quiz_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `qa_session` ON `quiz_answers` (`session_id`);--> statement-breakpoint
CREATE INDEX `qa_question` ON `quiz_answers` (`question_id`);--> statement-breakpoint
CREATE TABLE `quiz_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`level` text NOT NULL,
	`mode` text NOT NULL,
	`question_ids` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`total_count` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `qs_user_started` ON `quiz_sessions` (`user_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `topic_settings` (
	`user_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`level` text NOT NULL,
	`mode` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `topic_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_level` text DEFAULT 'rusty' NOT NULL,
	`default_mode` text DEFAULT 'manager' NOT NULL,
	`daily_goal_minutes` integer DEFAULT 20 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL
);
