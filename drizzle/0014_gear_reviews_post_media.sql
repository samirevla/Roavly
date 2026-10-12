ALTER TABLE `posts` ADD `media_type` text DEFAULT 'image' NOT NULL;--> statement-breakpoint
CREATE TABLE `gear_product_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`catalog_id` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text NOT NULL,
	`post_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gear_product_reviews_catalog_idx` ON `gear_product_reviews` (`catalog_id`);--> statement-breakpoint
CREATE INDEX `gear_product_reviews_user_idx` ON `gear_product_reviews` (`user_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `gear_product_reviews_user_catalog_idx` ON `gear_product_reviews` (`user_email`,`catalog_id`);
