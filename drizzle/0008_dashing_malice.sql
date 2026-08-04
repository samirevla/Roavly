ALTER TABLE `conversations` ADD `purpose` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `activity_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `starts_at` integer;--> statement-breakpoint
ALTER TABLE `conversations` ADD `location` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `plan_notes` text DEFAULT '' NOT NULL;