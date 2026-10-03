ALTER TABLE `posts` ADD `hidden_at` integer;--> statement-breakpoint
ALTER TABLE `comments` ADD `hidden_at` integer;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `hidden_at` integer;
