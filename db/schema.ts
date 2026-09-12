import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable(
  "profiles",
  {
    email: text("email").primaryKey(),
    displayName: text("display_name").notNull(),
    username: text("username").notNull(),
    bio: text("bio").notNull().default(""),
    homeBase: text("home_base").notNull().default(""),
    favoriteActivities: text("favorite_activities").notNull().default(""),
    ageBand: text("age_band").notNull().default("Prefer not to say"),
    experienceLevel: text("experience_level").notNull().default("All levels"),
    pacePreference: text("pace_preference").notNull().default("Flexible"),
    availability: text("availability").notNull().default("Weekends"),
    travelRadiusKm: integer("travel_radius_km").notNull().default(50),
    groupStyle: text("group_style").notNull().default("Social"),
    accessibilityNeeds: text("accessibility_needs").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("profiles_username_idx").on(table.username)],
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    authorEmail: text("author_email").notNull(),
    authorName: text("author_name").notNull(),
    caption: text("caption").notNull(),
    activityType: text("activity_type").notNull().default("Outdoor adventure"),
    location: text("location").notNull().default(""),
    latitude: real("latitude"),
    longitude: real("longitude"),
    placeId: text("place_id"),
    locationPrivacy: text("location_privacy").notNull().default("approximate"),
    distanceKm: integer("distance_km").notNull().default(0),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    elevationMetres: integer("elevation_metres").notNull().default(0),
    difficulty: text("difficulty").notNull().default("Moderate"),
    tips: text("tips").notNull().default(""),
    conditions: text("conditions").notNull().default(""),
    parkingInfo: text("parking_info").notNull().default(""),
    phoneSignal: text("phone_signal").notNull().default("Unknown"),
    toilets: text("toilets").notNull().default("Unknown"),
    accessibility: text("accessibility").notNull().default(""),
    dogFriendly: text("dog_friendly").notNull().default("Unknown"),
    bestTime: text("best_time").notNull().default(""),
    inspiredByPostId: text("inspired_by_post_id"),
    imageKey: text("image_key").notNull().default("grampians"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("posts_created_at_idx").on(table.createdAt),
    index("posts_inspired_by_idx").on(table.inspiredByPostId),
  ],
);

export const reactions = sqliteTable(
  "reactions",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    userEmail: text("user_email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("reactions_post_user_idx").on(table.postId, table.userEmail),
    index("reactions_post_idx").on(table.postId),
  ],
);

export const friendships = sqliteTable(
  "friendships",
  {
    id: text("id").primaryKey(),
    userOneEmail: text("user_one_email").notNull(),
    userTwoEmail: text("user_two_email").notNull(),
    requestedByEmail: text("requested_by_email").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("friendship_pair_idx").on(table.userOneEmail, table.userTwoEmail),
    index("friendship_user_one_idx").on(table.userOneEmail),
    index("friendship_user_two_idx").on(table.userTwoEmail),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    authorEmail: text("author_email").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("comments_post_idx").on(table.postId),
    index("comments_created_at_idx").on(table.createdAt),
  ],
);

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    reporterEmail: text("reporter_email").notNull(),
    reason: text("reason").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("reports_post_user_idx").on(table.postId, table.reporterEmail),
  ],
);

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    name: text("name").notNull().default(""),
    purpose: text("purpose").notNull().default("chat"),
    activityType: text("activity_type").notNull().default(""),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }),
    location: text("location").notNull().default(""),
    planNotes: text("plan_notes").notNull().default(""),
    adventurePlanId: text("adventure_plan_id"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    directKey: text("direct_key"),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("conversations_direct_key_idx").on(table.directKey),
    uniqueIndex("conversations_adventure_plan_idx").on(table.adventurePlanId),
    index("conversations_expires_at_idx").on(table.expiresAt),
    index("conversations_updated_at_idx").on(table.updatedAt),
  ],
);

export const conversationMembers = sqliteTable(
  "conversation_members",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    userEmail: text("user_email").notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
    lastReadAt: integer("last_read_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("conversation_member_idx").on(table.conversationId, table.userEmail),
    index("conversation_members_user_idx").on(table.userEmail),
    index("conversation_members_conversation_idx").on(table.conversationId),
  ],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    authorEmail: text("author_email").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("chat_messages_conversation_idx").on(table.conversationId),
    index("chat_messages_created_at_idx").on(table.createdAt),
  ],
);

export const savedJourneys = sqliteTable(
  "saved_journeys",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    userEmail: text("user_email").notNull(),
    status: text("status").notNull().default("saved"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("saved_journey_post_user_idx").on(table.postId, table.userEmail),
    index("saved_journey_user_idx").on(table.userEmail),
    index("saved_journey_post_idx").on(table.postId),
  ],
);

export const adventurePlans = sqliteTable(
  "adventure_plans",
  {
    id: text("id").primaryKey(),
    hostEmail: text("host_email").notNull(),
    sourcePostId: text("source_post_id"),
    title: text("title").notNull(),
    activityType: text("activity_type").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    location: text("location").notNull(),
    latitude: real("latitude"),
    longitude: real("longitude"),
    experienceLevel: text("experience_level").notNull().default("All levels"),
    pace: text("pace").notNull().default("Flexible"),
    equipment: text("equipment").notNull().default(""),
    capacity: integer("capacity").notNull().default(8),
    visibility: text("visibility").notNull().default("public"),
    status: text("status").notNull().default("open"),
    safetyNotes: text("safety_notes").notNull().default(""),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("plans_host_idx").on(table.hostEmail),
    index("plans_starts_at_idx").on(table.startsAt),
    index("plans_status_idx").on(table.status),
    index("plans_source_post_idx").on(table.sourcePostId),
  ],
);

export const planMembers = sqliteTable(
  "plan_members",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull(),
    userEmail: text("user_email").notNull(),
    status: text("status").notNull().default("requested"),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    checkedInAt: integer("checked_in_at", { mode: "timestamp_ms" }),
    safeAt: integer("safe_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("plan_member_plan_user_idx").on(table.planId, table.userEmail),
    index("plan_member_user_idx").on(table.userEmail),
  ],
);

export const safetyProfiles = sqliteTable("safety_profiles", {
  userEmail: text("user_email").primaryKey(),
  contactName: text("contact_name").notNull().default(""),
  contactMethod: text("contact_method").notNull().default(""),
  defaultCheckInMinutes: integer("default_check_in_minutes").notNull().default(120),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const clubs = sqliteTable(
  "clubs",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    activityType: text("activity_type").notNull().default("All outdoor activities"),
    homeBase: text("home_base").notNull().default(""),
    visibility: text("visibility").notNull().default("public"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("clubs_owner_idx").on(table.ownerEmail),
    index("clubs_created_at_idx").on(table.createdAt),
  ],
);

export const clubMembers = sqliteTable(
  "club_members",
  {
    id: text("id").primaryKey(),
    clubId: text("club_id").notNull(),
    userEmail: text("user_email").notNull(),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("club_member_club_user_idx").on(table.clubId, table.userEmail),
    index("club_member_user_idx").on(table.userEmail),
  ],
);

export const blocks = sqliteTable(
  "blocks",
  {
    id: text("id").primaryKey(),
    blockerEmail: text("blocker_email").notNull(),
    blockedEmail: text("blocked_email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("blocks_pair_idx").on(table.blockerEmail, table.blockedEmail),
    index("blocks_blocked_idx").on(table.blockedEmail),
  ],
);

export const mobileAuthCodes = sqliteTable(
  "mobile_auth_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    userEmail: text("user_email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("mobile_auth_codes_user_idx").on(table.userEmail),
    index("mobile_auth_codes_expires_idx").on(table.expiresAt),
  ],
);

export const authAccounts = sqliteTable("auth_accounts", {
  email: text("email").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const mobileAuthSessions = sqliteTable(
  "mobile_auth_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userEmail: text("user_email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("mobile_auth_sessions_token_idx").on(table.tokenHash),
    index("mobile_auth_sessions_user_idx").on(table.userEmail),
    index("mobile_auth_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const trails = sqliteTable(
  "trails",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    location: text("location").notNull(),
    placeId: text("place_id"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    difficulty: text("difficulty").notNull().default("Moderate"),
    distanceKm: real("distance_km").notNull().default(0),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("trails_location_idx").on(table.location),
    uniqueIndex("trails_place_id_idx").on(table.placeId),
  ],
);

export const creatorStatuses = sqliteTable("creator_status", {
  userEmail: text("user_email").primaryKey(),
  isVerifiedSeller: integer("is_verified_seller", { mode: "boolean" }).notNull().default(false),
  verificationCriteriaMet: text("verification_criteria_met").notNull().default("{}"),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  verifiedByEmail: text("verified_by_email"),
  stripeConnectAccountId: text("stripe_connect_account_id"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const trailTips = sqliteTable(
  "trail_tips",
  {
    id: text("id").primaryKey(),
    trailId: text("trail_id").notNull(),
    creatorEmail: text("creator_email").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    mediaKey: text("media_key").notNull(),
    previewKey: text("preview_key").notNull(),
    thumbnailKey: text("thumbnail_key").notNull().default(""),
    mediaType: text("media_type").notNull().default("video"),
    durationSeconds: integer("duration_seconds").notNull(),
    priceCents: integer("price_cents").notNull().default(99),
    status: text("status").notNull().default("draft"),
    riskFlags: text("risk_flags").notNull().default("[]"),
    moderationRequired: integer("moderation_required", { mode: "boolean" }).notNull().default(true),
    rejectionReason: text("rejection_reason").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("trail_tips_trail_status_idx").on(table.trailId, table.status),
    index("trail_tips_creator_idx").on(table.creatorEmail),
    index("trail_tips_created_idx").on(table.createdAt),
  ],
);

export const trailTipPurchases = sqliteTable(
  "trail_tip_purchases",
  {
    id: text("id").primaryKey(),
    tipId: text("tip_id").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    pricePaidCents: integer("price_paid_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    creatorPayoutCents: integer("creator_payout_cents").notNull(),
    purchaseSource: text("purchase_source").notNull().default("single"),
    status: text("status").notNull().default("paid"),
    purchasedAt: integer("purchased_at", { mode: "timestamp_ms" }).notNull(),
    paymentProviderRef: text("payment_provider_ref"),
    refundedAt: integer("refunded_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("trail_tip_buyer_idx").on(table.tipId, table.buyerEmail),
    index("trail_tip_purchases_buyer_idx").on(table.buyerEmail),
    index("trail_tip_purchases_provider_idx").on(table.paymentProviderRef),
  ],
);

export const trailTipReviews = sqliteTable(
  "trail_tip_reviews",
  {
    id: text("id").primaryKey(),
    tipId: text("tip_id").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("trail_tip_review_buyer_idx").on(table.tipId, table.buyerEmail),
    index("trail_tip_reviews_tip_idx").on(table.tipId),
  ],
);

export const tipModerationAudits = sqliteTable(
  "tip_moderation_audits",
  {
    id: text("id").primaryKey(),
    tipId: text("tip_id").notNull(),
    moderatorEmail: text("moderator_email").notNull(),
    decision: text("decision").notNull(),
    notes: text("notes").notNull().default(""),
    riskFlags: text("risk_flags").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("tip_moderation_tip_idx").on(table.tipId)],
);

export const tipReports = sqliteTable(
  "tip_reports",
  {
    id: text("id").primaryKey(),
    tipId: text("tip_id").notNull(),
    reporterEmail: text("reporter_email").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("tip_report_user_idx").on(table.tipId, table.reporterEmail),
    index("tip_report_status_idx").on(table.status),
  ],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    userEmail: text("user_email").primaryKey(),
    plan: text("plan").notNull(),
    status: text("status").notNull(),
    currentPeriodStart: integer("current_period_start", { mode: "timestamp_ms" }).notNull(),
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }).notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    paymentProviderRef: text("payment_provider_ref"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("subscriptions_status_idx").on(table.status)],
);

export const tipCreditsLedger = sqliteTable(
  "tip_credits_ledger",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    periodStart: integer("period_start", { mode: "timestamp_ms" }).notNull(),
    periodEnd: integer("period_end", { mode: "timestamp_ms" }).notNull(),
    creditsTotal: integer("credits_total").notNull(),
    creditsUsed: integer("credits_used").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("tip_credits_user_period_idx").on(table.userEmail, table.periodStart),
    index("tip_credits_period_end_idx").on(table.periodEnd),
  ],
);

export const creatorBalances = sqliteTable("creator_balances", {
  userEmail: text("user_email").primaryKey(),
  pendingCents: integer("pending_cents").notNull().default(0),
  paidCents: integer("paid_cents").notNull().default(0),
  lifetimeCents: integer("lifetime_cents").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const billingEvents = sqliteTable("billing_events", {
  providerEventId: text("provider_event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }).notNull(),
});

export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    eventName: text("event_name").notNull(),
    userEmail: text("user_email"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    properties: text("properties").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("analytics_event_name_idx").on(table.eventName),
    index("analytics_created_idx").on(table.createdAt),
  ],
);

export const gearTags = sqliteTable(
  "gear_tags",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    productName: text("product_name").notNull(),
    brand: text("brand").notNull(),
    affiliateUrl: text("affiliate_url").notNull(),
    clickCount: integer("click_count").notNull().default(0),
    conversionCount: integer("conversion_count").notNull().default(0),
    commissionCents: integer("commission_cents").notNull().default(0),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("gear_tags_target_idx").on(table.targetType, table.targetId)],
);

export const businessPartners = sqliteTable("business_partners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  websiteUrl: text("website_url").notNull().default(""),
  logoUrl: text("logo_url").notNull().default(""),
  latitude: real("latitude"),
  longitude: real("longitude"),
  radiusKm: integer("radius_km").notNull().default(25),
  subscriptionTier: text("subscription_tier").notNull().default("featured"),
  billingStatus: text("billing_status").notNull().default("inactive"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const partnerPlacements = sqliteTable(
  "partner_placements",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id").notNull(),
    trailId: text("trail_id"),
    activityType: text("activity_type"),
    placementType: text("placement_type").notNull(),
    label: text("label").notNull().default("Partner"),
    headline: text("headline").notNull(),
    startDate: integer("start_date", { mode: "timestamp_ms" }).notNull(),
    endDate: integer("end_date", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("partner_placements_trail_idx").on(table.trailId),
    index("partner_placements_dates_idx").on(table.startDate, table.endDate),
  ],
);

export const sponsoredChallenges = sqliteTable(
  "sponsored_challenges",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    sponsorName: text("sponsor_name").notNull(),
    sponsorLogoUrl: text("sponsor_logo_url").notNull().default(""),
    startDate: integer("start_date", { mode: "timestamp_ms" }).notNull(),
    endDate: integer("end_date", { mode: "timestamp_ms" }).notNull(),
    metric: text("metric").notNull(),
    target: integer("target").notNull(),
    rules: text("rules").notNull(),
    prizeDescription: text("prize_description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("sponsored_challenges_dates_idx").on(table.startDate, table.endDate)],
);

export const challengeParticipants = sqliteTable(
  "challenge_participants",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull(),
    userEmail: text("user_email").notNull(),
    progress: text("progress").notNull().default("{}"),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("challenge_participant_idx").on(table.challengeId, table.userEmail),
    index("challenge_participant_user_idx").on(table.userEmail),
  ],
);

export const adCampaigns = sqliteTable("ad_campaigns", {
  id: text("id").primaryKey(),
  advertiserName: text("advertiser_name").notNull(),
  headline: text("headline").notNull(),
  body: text("body").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  destinationUrl: text("destination_url").notNull(),
  activityType: text("activity_type"),
  startDate: integer("start_date", { mode: "timestamp_ms" }).notNull(),
  endDate: integer("end_date", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const adImpressions = sqliteTable(
  "ad_impressions",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    userEmail: text("user_email").notNull(),
    placement: text("placement").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("ad_impressions_campaign_idx").on(table.campaignId)],
);
