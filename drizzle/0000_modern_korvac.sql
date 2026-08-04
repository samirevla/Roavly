CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_email` text NOT NULL,
	`author_name` text NOT NULL,
	`caption` text NOT NULL,
	`activity_type` text DEFAULT 'Outdoor adventure' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `posts_created_at_idx` ON `posts` (`created_at`);