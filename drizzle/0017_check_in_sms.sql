CREATE TABLE `check_in_sms` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`member_id` text NOT NULL,
	`anchor_ms` integer NOT NULL,
	`sent_at` integer NOT NULL
);
