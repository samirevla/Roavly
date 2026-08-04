CREATE TABLE `ad_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`advertiser_name` text NOT NULL,
	`headline` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`destination_url` text NOT NULL,
	`activity_type` text,
	`start_date` integer NOT NULL,
	`end_date` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ad_impressions` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_email` text NOT NULL,
	`placement` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ad_impressions_campaign_idx` ON `ad_impressions` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_name` text NOT NULL,
	`user_email` text,
	`entity_type` text,
	`entity_id` text,
	`properties` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_event_name_idx` ON `analytics_events` (`event_name`);--> statement-breakpoint
CREATE INDEX `analytics_created_idx` ON `analytics_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `billing_events` (
	`provider_event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_partners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`website_url` text DEFAULT '' NOT NULL,
	`logo_url` text DEFAULT '' NOT NULL,
	`latitude` real,
	`longitude` real,
	`radius_km` integer DEFAULT 25 NOT NULL,
	`subscription_tier` text DEFAULT 'featured' NOT NULL,
	`billing_status` text DEFAULT 'inactive' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `challenge_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`user_email` text NOT NULL,
	`progress` text DEFAULT '{}' NOT NULL,
	`joined_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `challenge_participant_idx` ON `challenge_participants` (`challenge_id`,`user_email`);--> statement-breakpoint
CREATE INDEX `challenge_participant_user_idx` ON `challenge_participants` (`user_email`);--> statement-breakpoint
CREATE TABLE `creator_balances` (
	`user_email` text PRIMARY KEY NOT NULL,
	`pending_cents` integer DEFAULT 0 NOT NULL,
	`paid_cents` integer DEFAULT 0 NOT NULL,
	`lifetime_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `creator_status` (
	`user_email` text PRIMARY KEY NOT NULL,
	`is_verified_seller` integer DEFAULT false NOT NULL,
	`verification_criteria_met` text DEFAULT '{}' NOT NULL,
	`verified_at` integer,
	`verified_by_email` text,
	`stripe_connect_account_id` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gear_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`product_name` text NOT NULL,
	`brand` text NOT NULL,
	`affiliate_url` text NOT NULL,
	`click_count` integer DEFAULT 0 NOT NULL,
	`conversion_count` integer DEFAULT 0 NOT NULL,
	`commission_cents` integer DEFAULT 0 NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gear_tags_target_idx` ON `gear_tags` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `partner_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`trail_id` text,
	`activity_type` text,
	`placement_type` text NOT NULL,
	`label` text DEFAULT 'Partner' NOT NULL,
	`headline` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `partner_placements_trail_idx` ON `partner_placements` (`trail_id`);--> statement-breakpoint
CREATE INDEX `partner_placements_dates_idx` ON `partner_placements` (`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `sponsored_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`sponsor_name` text NOT NULL,
	`sponsor_logo_url` text DEFAULT '' NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer NOT NULL,
	`metric` text NOT NULL,
	`target` integer NOT NULL,
	`rules` text NOT NULL,
	`prize_description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sponsored_challenges_dates_idx` ON `sponsored_challenges` (`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`user_email` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`status` text NOT NULL,
	`current_period_start` integer NOT NULL,
	`current_period_end` integer NOT NULL,
	`stripe_customer_id` text,
	`payment_provider_ref` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscriptions_status_idx` ON `subscriptions` (`status`);--> statement-breakpoint
CREATE TABLE `tip_credits_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`credits_total` integer NOT NULL,
	`credits_used` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tip_credits_user_period_idx` ON `tip_credits_ledger` (`user_email`,`period_start`);--> statement-breakpoint
CREATE INDEX `tip_credits_period_end_idx` ON `tip_credits_ledger` (`period_end`);--> statement-breakpoint
CREATE TABLE `tip_moderation_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`tip_id` text NOT NULL,
	`moderator_email` text NOT NULL,
	`decision` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`risk_flags` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tip_moderation_tip_idx` ON `tip_moderation_audits` (`tip_id`);--> statement-breakpoint
CREATE TABLE `tip_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`tip_id` text NOT NULL,
	`reporter_email` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tip_report_user_idx` ON `tip_reports` (`tip_id`,`reporter_email`);--> statement-breakpoint
CREATE INDEX `tip_report_status_idx` ON `tip_reports` (`status`);--> statement-breakpoint
CREATE TABLE `trail_tip_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`tip_id` text NOT NULL,
	`buyer_email` text NOT NULL,
	`price_paid_cents` integer NOT NULL,
	`platform_fee_cents` integer NOT NULL,
	`creator_payout_cents` integer NOT NULL,
	`purchase_source` text DEFAULT 'single' NOT NULL,
	`status` text DEFAULT 'paid' NOT NULL,
	`purchased_at` integer NOT NULL,
	`payment_provider_ref` text,
	`refunded_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trail_tip_buyer_idx` ON `trail_tip_purchases` (`tip_id`,`buyer_email`);--> statement-breakpoint
CREATE INDEX `trail_tip_purchases_buyer_idx` ON `trail_tip_purchases` (`buyer_email`);--> statement-breakpoint
CREATE INDEX `trail_tip_purchases_provider_idx` ON `trail_tip_purchases` (`payment_provider_ref`);--> statement-breakpoint
CREATE TABLE `trail_tip_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`tip_id` text NOT NULL,
	`buyer_email` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trail_tip_review_buyer_idx` ON `trail_tip_reviews` (`tip_id`,`buyer_email`);--> statement-breakpoint
CREATE INDEX `trail_tip_reviews_tip_idx` ON `trail_tip_reviews` (`tip_id`);--> statement-breakpoint
CREATE TABLE `trail_tips` (
	`id` text PRIMARY KEY NOT NULL,
	`trail_id` text NOT NULL,
	`creator_email` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`media_key` text NOT NULL,
	`preview_key` text NOT NULL,
	`thumbnail_key` text DEFAULT '' NOT NULL,
	`media_type` text DEFAULT 'video' NOT NULL,
	`duration_seconds` integer NOT NULL,
	`price_cents` integer DEFAULT 99 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`risk_flags` text DEFAULT '[]' NOT NULL,
	`moderation_required` integer DEFAULT true NOT NULL,
	`rejection_reason` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trail_tips_trail_status_idx` ON `trail_tips` (`trail_id`,`status`);--> statement-breakpoint
CREATE INDEX `trail_tips_creator_idx` ON `trail_tips` (`creator_email`);--> statement-breakpoint
CREATE INDEX `trail_tips_created_idx` ON `trail_tips` (`created_at`);--> statement-breakpoint
CREATE TABLE `trails` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`place_id` text,
	`latitude` real,
	`longitude` real,
	`difficulty` text DEFAULT 'Moderate' NOT NULL,
	`distance_km` real DEFAULT 0 NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trails_location_idx` ON `trails` (`location`);--> statement-breakpoint
CREATE UNIQUE INDEX `trails_place_id_idx` ON `trails` (`place_id`);