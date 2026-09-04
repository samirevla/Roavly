CREATE TABLE `auth_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
