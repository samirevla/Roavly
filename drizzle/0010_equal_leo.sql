ALTER TABLE `adventure_plans` ADD `started_at` integer;--> statement-breakpoint
ALTER TABLE `adventure_plans` ADD `completed_at` integer;--> statement-breakpoint
CREATE INDEX `plans_status_idx` ON `adventure_plans` (`status`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `adventure_plan_id` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `expires_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_adventure_plan_idx` ON `conversations` (`adventure_plan_id`);--> statement-breakpoint
CREATE INDEX `conversations_expires_at_idx` ON `conversations` (`expires_at`);