CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_email` text NOT NULL,
	`actor_email` text NOT NULL,
	`type` text NOT NULL,
	`post_id` text,
	`plan_id` text,
	`body` text DEFAULT '' NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_email`,`created_at`);
