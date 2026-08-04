CREATE TABLE `adventure_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`host_email` text NOT NULL,
	`source_post_id` text,
	`title` text NOT NULL,
	`activity_type` text NOT NULL,
	`starts_at` integer NOT NULL,
	`location` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`experience_level` text DEFAULT 'All levels' NOT NULL,
	`pace` text DEFAULT 'Flexible' NOT NULL,
	`equipment` text DEFAULT '' NOT NULL,
	`capacity` integer DEFAULT 8 NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`safety_notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plans_host_idx` ON `adventure_plans` (`host_email`);--> statement-breakpoint
CREATE INDEX `plans_starts_at_idx` ON `adventure_plans` (`starts_at`);--> statement-breakpoint
CREATE INDEX `plans_source_post_idx` ON `adventure_plans` (`source_post_id`);--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`blocker_email` text NOT NULL,
	`blocked_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_pair_idx` ON `blocks` (`blocker_email`,`blocked_email`);--> statement-breakpoint
CREATE INDEX `blocks_blocked_idx` ON `blocks` (`blocked_email`);--> statement-breakpoint
CREATE TABLE `club_members` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`user_email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `club_member_club_user_idx` ON `club_members` (`club_id`,`user_email`);--> statement-breakpoint
CREATE INDEX `club_member_user_idx` ON `club_members` (`user_email`);--> statement-breakpoint
CREATE TABLE `clubs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`activity_type` text DEFAULT 'All outdoor activities' NOT NULL,
	`home_base` text DEFAULT '' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clubs_owner_idx` ON `clubs` (`owner_email`);--> statement-breakpoint
CREATE INDEX `clubs_created_at_idx` ON `clubs` (`created_at`);--> statement-breakpoint
CREATE TABLE `plan_members` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`user_email` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`requested_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`checked_in_at` integer,
	`safe_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_member_plan_user_idx` ON `plan_members` (`plan_id`,`user_email`);--> statement-breakpoint
CREATE INDEX `plan_member_user_idx` ON `plan_members` (`user_email`);--> statement-breakpoint
CREATE TABLE `safety_profiles` (
	`user_email` text PRIMARY KEY NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_method` text DEFAULT '' NOT NULL,
	`default_check_in_minutes` integer DEFAULT 120 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saved_journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_email` text NOT NULL,
	`status` text DEFAULT 'saved' NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_journey_post_user_idx` ON `saved_journeys` (`post_id`,`user_email`);--> statement-breakpoint
CREATE INDEX `saved_journey_user_idx` ON `saved_journeys` (`user_email`);--> statement-breakpoint
CREATE INDEX `saved_journey_post_idx` ON `saved_journeys` (`post_id`);--> statement-breakpoint
ALTER TABLE `posts` ADD `location_privacy` text DEFAULT 'approximate' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `difficulty` text DEFAULT 'Moderate' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `tips` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `conditions` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `parking_info` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `phone_signal` text DEFAULT 'Unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `toilets` text DEFAULT 'Unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `accessibility` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `dog_friendly` text DEFAULT 'Unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `best_time` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `inspired_by_post_id` text;--> statement-breakpoint
CREATE INDEX `posts_inspired_by_idx` ON `posts` (`inspired_by_post_id`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `experience_level` text DEFAULT 'All levels' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `pace_preference` text DEFAULT 'Flexible' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `availability` text DEFAULT 'Weekends' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `travel_radius_km` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `group_style` text DEFAULT 'Social' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `accessibility_needs` text DEFAULT '' NOT NULL;