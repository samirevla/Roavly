CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`author_email` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_messages_conversation_idx` ON `chat_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `chat_messages_created_at_idx` ON `chat_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_members` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_email` text NOT NULL,
	`joined_at` integer NOT NULL,
	`last_read_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_member_idx` ON `conversation_members` (`conversation_id`,`user_email`);--> statement-breakpoint
CREATE INDEX `conversation_members_user_idx` ON `conversation_members` (`user_email`);--> statement-breakpoint
CREATE INDEX `conversation_members_conversation_idx` ON `conversation_members` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`direct_key` text,
	`created_by_email` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_direct_key_idx` ON `conversations` (`direct_key`);--> statement-breakpoint
CREATE INDEX `conversations_updated_at_idx` ON `conversations` (`updated_at`);