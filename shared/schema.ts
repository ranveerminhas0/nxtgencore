import { pgTable, text, timestamp, boolean, integer, serial, bigint, primaryKey, unique, pgEnum, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";


// GUILD SETTINGS - Per-server configuration

export const guildSettings = pgTable("guild_settings", {
  guildId: bigint("guild_id", { mode: "bigint" }).primaryKey(),

  // Channels
  introChannelId: bigint("intro_channel_id", { mode: "bigint" }),
  logChannelId: bigint("log_channel_id", { mode: "bigint" }),

  // Roles
  unverifiedRoleId: bigint("unverified_role_id", { mode: "bigint" }),
  verifiedRoleId: bigint("verified_role_id", { mode: "bigint" }),

  // Onboarding behavior
  introTimeoutSeconds: integer("intro_timeout_seconds").default(300).notNull(),
  introReminderEnabled: boolean("intro_reminder_enabled").default(true).notNull(),

  // Feature toggles
  moderationEnabled: boolean("moderation_enabled").default(true).notNull(),
  aiEnabled: boolean("ai_enabled").default(true).notNull(),
  musicEnabled: boolean("music_enabled").default(true).notNull(),
  giveawaysEnabled: boolean("giveaways_enabled").default(true).notNull(),
  giveawaysChannelId: bigint("giveaways_channel_id", { mode: "bigint" }),

  // Challenge system
  challengeChannelId: bigint("challenge_channel_id", { mode: "bigint" }),
  challengeAnnouncementChannelId: bigint("challenge_announcement_channel_id", { mode: "bigint" }),
  challengeEnabled: boolean("challenge_enabled").default(false).notNull(),
  lastChallengeDifficulty: text("last_challenge_difficulty"),
  lastChallengePostedAt: timestamp("last_challenge_posted_at"),

  // QOTD system
  qotdChannelId: bigint("qotd_channel_id", { mode: "bigint" }),
  qotdEnabled: boolean("qotd_enabled").default(false).notNull(),
  lastQotdPostedAt: timestamp("last_qotd_posted_at"),

  // Metadata
  configuredBy: bigint("configured_by", { mode: "bigint" }),
  configuredAt: timestamp("configured_at").defaultNow().notNull(),
});


// USERS - Per-guild user tracking

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  discordId: bigint("discord_id", { mode: "bigint" }).notNull(),
  guildId: bigint("guild_id", { mode: "bigint" }).notNull(),
  username: text("username").notNull(),
  joinedAt: timestamp("joined_at").notNull(),
  introductionMessageId: bigint("introduction_message_id", { mode: "bigint" }),
  isActive: boolean("is_active").default(true).notNull(),
}, (table) => ({
  unq: unique().on(table.guildId, table.discordId),
}));


// PENDING VERIFICATIONS - Onboarding state

export const pendingVerifications = pgTable("pending_verifications", {
  guildId: bigint("guild_id", { mode: "bigint" }).notNull(),
  discordId: bigint("discord_id", { mode: "bigint" }).notNull(),
  joinedAt: timestamp("joined_at").notNull(),
  reminderSent: boolean("reminder_sent").default(false).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.guildId, table.discordId] }),
}));


// GIVEAWAYS - Global giveaway registry (just for dedup)

export const giveaways = pgTable("giveaways", {
  giveawayId: text("giveaway_id").primaryKey(),
  provider: text("provider"),
  title: text("title"),
  resolvedUrl: text("resolved_url").notNull(),
  resolvedAt: timestamp("resolved_at"),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
});


// GUILD GIVEAWAYS - Per-guild delivery tracking

export const guildGiveaways = pgTable("guild_giveaways", {
  guildId: bigint("guild_id", { mode: "bigint" }).notNull(),
  giveawayId: text("giveaway_id").notNull(),
  postedAt: timestamp("posted_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.guildId, table.giveawayId] }),
}));


// CHALLENGE REVIEW SYSTEM

export const challengeStatusEnum = pgEnum("challenge_status", ["CORRECT", "INCORRECT", "PARTIAL"]);
export const reviewStateEnum = pgEnum("review_state", ["PENDING", "REVIEWING", "REVIEWED", "FAILED"]);

export const challengeSubmissions = pgTable("challenge_submissions", {
  id: serial("id").primaryKey(),
  guildId: bigint("guild_id", { mode: "bigint" }).notNull(),
  threadId: bigint("thread_id", { mode: "bigint" }).notNull(),
  messageId: bigint("message_id", { mode: "bigint" }).notNull(),
  userId: bigint("user_id", { mode: "bigint" }).notNull(),
  challengeId: text("challenge_id").notNull(),
  attemptNumber: integer("attempt_number").notNull().default(1),
  codeSnippet: text("code_snippet"),
  language: text("language"),
  status: challengeStatusEnum("status"),
  reviewState: reviewStateEnum("review_state").default("PENDING").notNull(),
  aiConfidence: real("ai_confidence"),
  aiExplanation: text("ai_explanation"),
  reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
  pointsAwarded: integer("points_awarded").default(0),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("idx_challenge_submissions_user_id").on(table.userId),
  guildIdIdx: index("idx_challenge_submissions_guild_id").on(table.guildId),
  challengeIdIdx: index("idx_challenge_submissions_challenge_id").on(table.challengeId),
}));

export const userChallengeStats = pgTable("user_challenge_stats", {
  userId: bigint("user_id", { mode: "bigint" }).notNull(),
  guildId: bigint("guild_id", { mode: "bigint" }).notNull(),
  totalSolved: integer("total_solved").default(0),
  totalPoints: integer("total_points").default(0),
  currentStreak: integer("current_streak").default(0),
  bestStreak: integer("best_streak").default(0),
  lastSolvedAt: timestamp("last_solved_at", { withTimezone: true }),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.guildId] }),
  guildIdIdx: index("idx_user_challenge_stats_guild_id").on(table.guildId),
}));


// ZOD SCHEMAS & TYPES

export const insertGuildSettingsSchema = createInsertSchema(guildSettings);
export const insertUserSchema = createInsertSchema(users);
export const insertPendingVerificationSchema = createInsertSchema(pendingVerifications);
export const insertGiveawaySchema = createInsertSchema(giveaways);
export const insertGuildGiveawaySchema = createInsertSchema(guildGiveaways);
export const insertChallengeSubmissionSchema = createInsertSchema(challengeSubmissions);
export const insertUserChallengeStatsSchema = createInsertSchema(userChallengeStats);

export type GuildSettings = typeof guildSettings.$inferSelect;
export type InsertGuildSettings = z.infer<typeof insertGuildSettingsSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type PendingVerification = typeof pendingVerifications.$inferSelect;
export type InsertPendingVerification = z.infer<typeof insertPendingVerificationSchema>;
export type Giveaway = typeof giveaways.$inferSelect;
export type InsertGiveaway = z.infer<typeof insertGiveawaySchema>;
export type GuildGiveaway = typeof guildGiveaways.$inferSelect;
export type InsertGuildGiveaway = z.infer<typeof insertGuildGiveawaySchema>;
export type ChallengeSubmission = typeof challengeSubmissions.$inferSelect;
export type InsertChallengeSubmission = z.infer<typeof insertChallengeSubmissionSchema>;
export type UserChallengeStats = typeof userChallengeStats.$inferSelect;
export type InsertUserChallengeStats = z.infer<typeof insertUserChallengeStatsSchema>;

export interface BotStatus {
  online: boolean;
  uptime: number;
  trackedUsersCount: number;
}

