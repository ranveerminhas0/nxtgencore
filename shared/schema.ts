import { pgTable, text, timestamp, boolean, integer, serial, bigint, primaryKey, unique } from "drizzle-orm/pg-core";
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


// ZOD SCHEMAS & TYPES

export const insertGuildSettingsSchema = createInsertSchema(guildSettings);
export const insertUserSchema = createInsertSchema(users);
export const insertPendingVerificationSchema = createInsertSchema(pendingVerifications);
export const insertGiveawaySchema = createInsertSchema(giveaways);
export const insertGuildGiveawaySchema = createInsertSchema(guildGiveaways);

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

export interface BotStatus {
  online: boolean;
  uptime: number;
  trackedUsersCount: number;
}
