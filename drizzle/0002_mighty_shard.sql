CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`author_email` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_post_idx` ON `comments` (`post_id`);--> statement-breakpoint
CREATE INDEX `comments_created_at_idx` ON `comments` (`created_at`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_one_email` text NOT NULL,
	`user_two_email` text NOT NULL,
	`requested_by_email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendship_pair_idx` ON `friendships` (`user_one_email`,`user_two_email`);--> statement-breakpoint
CREATE INDEX `friendship_user_one_idx` ON `friendships` (`user_one_email`);--> statement-breakpoint
CREATE INDEX `friendship_user_two_idx` ON `friendships` (`user_two_email`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`reporter_email` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_post_user_idx` ON `reports` (`post_id`,`reporter_email`);
--> statement-breakpoint
DELETE FROM `reactions`;--> statement-breakpoint
DELETE FROM `posts`;--> statement-breakpoint
UPDATE `profiles`
SET `bio` = '', `home_base` = '', `favorite_activities` = ''
WHERE `bio` = 'Getting outside, one adventure at a time.';
