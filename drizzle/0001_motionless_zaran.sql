CREATE TABLE `challenge_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`user_email` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `challenge_user_idx` ON `challenge_memberships` (`challenge_id`,`user_email`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`username` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`home_base` text DEFAULT '' NOT NULL,
	`favorite_activities` text DEFAULT 'Hiking' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reactions_post_user_idx` ON `reactions` (`post_id`,`user_email`);--> statement-breakpoint
CREATE INDEX `reactions_post_idx` ON `reactions` (`post_id`);--> statement-breakpoint
ALTER TABLE `posts` ADD `location` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `distance_km` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `duration_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `elevation_metres` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `image_key` text DEFAULT 'grampians' NOT NULL;