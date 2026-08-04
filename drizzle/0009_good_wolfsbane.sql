CREATE TABLE `mobile_auth_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mobile_auth_codes_user_idx` ON `mobile_auth_codes` (`user_email`);--> statement-breakpoint
CREATE INDEX `mobile_auth_codes_expires_idx` ON `mobile_auth_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `mobile_auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_email` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_auth_sessions_token_idx` ON `mobile_auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `mobile_auth_sessions_user_idx` ON `mobile_auth_sessions` (`user_email`);--> statement-breakpoint
CREATE INDEX `mobile_auth_sessions_expires_idx` ON `mobile_auth_sessions` (`expires_at`);