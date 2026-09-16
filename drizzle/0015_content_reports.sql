CREATE TABLE `content_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reporter_email` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_reports_target_user_idx` ON `content_reports` (`target_type`,`target_id`,`reporter_email`);--> statement-breakpoint
CREATE INDEX `content_reports_status_idx` ON `content_reports` (`status`);
