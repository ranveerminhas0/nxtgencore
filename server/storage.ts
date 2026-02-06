import {
  users,
  guildSettings,
  pendingVerifications,
  giveaways,
  guildGiveaways,
  type User,
  type InsertUser,
  type GuildSettings,
  type InsertGuildSettings,
  type PendingVerification,
  type Giveaway,
  type InsertGiveaway,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull, isNotNull, notInArray, sql, lte } from "drizzle-orm";

// STORAGE INTERFACE
export interface IStorage {
  // Guild Settings
  getGuildSettings(guildId: bigint): Promise<GuildSettings | undefined>;
  upsertGuildSettings(settings: InsertGuildSettings): Promise<GuildSettings>;
  getAllConfiguredGuilds(): Promise<GuildSettings[]>;

  // Users (per-guild)
  getUser(guildId: bigint, discordId: bigint): Promise<User | undefined>;
  upsertUser(guildId: bigint, discordId: bigint, username: string, joinedAt?: Date): Promise<User>;
  markUserInactive(guildId: bigint, discordId: bigint): Promise<User | undefined>;
  updateIntroduction(guildId: bigint, discordId: bigint, messageId: bigint): Promise<User | undefined>;

  // Pending Verifications
  addPendingVerification(guildId: bigint, discordId: bigint): Promise<void>;
  removePendingVerification(guildId: bigint, discordId: bigint): Promise<void>;
  getPendingVerificationsToWarn(guildId: bigint, timeoutSeconds: number): Promise<PendingVerification[]>;
  markReminderSent(guildId: bigint, discordId: bigint): Promise<void>;

  // Giveaways (global)
  existsGiveaway(giveawayId: string): Promise<boolean>;
  insertGiveaway(giveaway: InsertGiveaway): Promise<Giveaway>;

  // Guild Giveaways (per-guild delivery)
  hasGuildReceivedGiveaway(guildId: bigint, giveawayId: string): Promise<boolean>;
  getMissingGiveawaysForGuild(guildId: bigint): Promise<Giveaway[]>;
  recordGuildGiveaway(guildId: bigint, giveawayId: string): Promise<void>;
  bootstrapGuildGiveaways(guildId: bigint, keepLatest?: number): Promise<void>;
}

// DATABASE STORAGE IMPLEMENTATION
export class DatabaseStorage implements IStorage {

  // GUILD SETTINGS
  async getGuildSettings(guildId: bigint): Promise<GuildSettings | undefined> {
    const [settings] = await db
      .select()
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId));
    return settings;
  }

  async upsertGuildSettings(settings: InsertGuildSettings): Promise<GuildSettings> {
    const [result] = await db
      .insert(guildSettings)
      .values(settings)
      .onConflictDoUpdate({
        target: guildSettings.guildId,
        set: {
          introChannelId: settings.introChannelId,
          logChannelId: settings.logChannelId,
          unverifiedRoleId: settings.unverifiedRoleId,
          verifiedRoleId: settings.verifiedRoleId,
          introTimeoutSeconds: settings.introTimeoutSeconds,
          introReminderEnabled: settings.introReminderEnabled,
          moderationEnabled: settings.moderationEnabled,
          aiEnabled: settings.aiEnabled,
          musicEnabled: settings.musicEnabled,
          giveawaysEnabled: settings.giveawaysEnabled,
          giveawaysChannelId: settings.giveawaysChannelId,
          configuredBy: settings.configuredBy,
          configuredAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async getAllConfiguredGuilds(): Promise<GuildSettings[]> {
    return await db.select().from(guildSettings);
  }

  // USERS
  async getUser(guildId: bigint, discordId: bigint): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.guildId, guildId),
        eq(users.discordId, discordId)
      ));
    return user;
  }

  async upsertUser(guildId: bigint, discordId: bigint, username: string, joinedAt?: Date): Promise<User> {
    const [result] = await db
      .insert(users)
      .values({
        guildId,
        discordId,
        username,
        joinedAt: joinedAt ?? new Date(),
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [users.guildId, users.discordId],
        set: {
          // Only update username on conflict - preserve joinedAt and isActive
          username,
        },
      })
      .returning();
    return result;
  }

  async markUserInactive(guildId: bigint, discordId: bigint): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ isActive: false })
      .where(and(
        eq(users.guildId, guildId),
        eq(users.discordId, discordId)
      ))
      .returning();
    return updated;
  }

  async updateIntroduction(guildId: bigint, discordId: bigint, messageId: bigint): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ introductionMessageId: messageId })
      .where(and(
        eq(users.guildId, guildId),
        eq(users.discordId, discordId),
        isNull(users.introductionMessageId)
      ))
      .returning();
    return updated;
  }

  // PENDING VERIFICATIONS
  async addPendingVerification(guildId: bigint, discordId: bigint): Promise<void> {
    await db
      .insert(pendingVerifications)
      .values({
        guildId,
        discordId,
        joinedAt: new Date(),
        reminderSent: false,
      })
      .onConflictDoUpdate({
        target: [pendingVerifications.guildId, pendingVerifications.discordId],
        set: {
          joinedAt: new Date(),
          reminderSent: false,
        },
      });
  }

  async removePendingVerification(guildId: bigint, discordId: bigint): Promise<void> {
    await db
      .delete(pendingVerifications)
      .where(and(
        eq(pendingVerifications.guildId, guildId),
        eq(pendingVerifications.discordId, discordId)
      ));
  }

  async getPendingVerificationsToWarn(guildId: bigint, timeoutSeconds: number): Promise<PendingVerification[]> {
    const cutoff = new Date(Date.now() - timeoutSeconds * 1000);
    return await db
      .select()
      .from(pendingVerifications)
      .where(and(
        eq(pendingVerifications.guildId, guildId),
        eq(pendingVerifications.reminderSent, false),
        lte(pendingVerifications.joinedAt, cutoff)
      ));
  }

  async markReminderSent(guildId: bigint, discordId: bigint): Promise<void> {
    await db
      .update(pendingVerifications)
      .set({ reminderSent: true })
      .where(and(
        eq(pendingVerifications.guildId, guildId),
        eq(pendingVerifications.discordId, discordId)
      ));
  }

  // GIVEAWAYS (GLOBAL)
  async existsGiveaway(giveawayId: string): Promise<boolean> {
    const [giveaway] = await db
      .select()
      .from(giveaways)
      .where(eq(giveaways.giveawayId, giveawayId));
    return !!giveaway;
  }

  async insertGiveaway(giveaway: InsertGiveaway): Promise<Giveaway> {
    const [result] = await db
      .insert(giveaways)
      .values(giveaway)
      .onConflictDoNothing()
      .returning();
    return result;
  }

  // GUILD GIVEAWAYS (PER-GUILD DELIVERY)
  async getMissingGiveawaysForGuild(guildId: bigint): Promise<Giveaway[]> {
    // Get all giveaways with resolved_url that haven't been posted to this guild
    const postedIds = db
      .select({ giveawayId: guildGiveaways.giveawayId })
      .from(guildGiveaways)
      .where(eq(guildGiveaways.guildId, guildId));

    return await db
      .select()
      .from(giveaways)
      .where(and(
        isNotNull(giveaways.resolvedUrl),
        notInArray(giveaways.giveawayId, postedIds)
      ));
  }

  async hasGuildReceivedGiveaway(guildId: bigint, giveawayId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(guildGiveaways)
      .where(and(
        eq(guildGiveaways.guildId, guildId),
        eq(guildGiveaways.giveawayId, giveawayId)
      ));
    return !!existing;
  }

  async recordGuildGiveaway(guildId: bigint, giveawayId: string): Promise<void> {
    // CRITICAL: Only call after successful Discord post
    await db
      .insert(guildGiveaways)
      .values({
        guildId,
        giveawayId,
        postedAt: new Date(),
      })
      .onConflictDoNothing(); // Idempotent: safe to call multiple times
  }

  // Mark all giveaways except the last N as already received (for new guild setups)
  async bootstrapGuildGiveaways(guildId: bigint, keepLatest: number = 2): Promise<void> {
    // Get all giveaways ordered by created_at descending
    const allGiveaways = await db
      .select({ giveawayId: giveaways.giveawayId })
      .from(giveaways)
      .where(isNotNull(giveaways.resolvedUrl))
      .orderBy(sql`${giveaways.firstSeenAt} DESC`);

    if (allGiveaways.length <= keepLatest) {
      // Not enough giveaways to skip any
      return;
    }

    // Skip the first N (latest), mark the rest as already received
    const giveawaysToMark = allGiveaways.slice(keepLatest);

    for (const g of giveawaysToMark) {
      await db
        .insert(guildGiveaways)
        .values({
          guildId,
          giveawayId: g.giveawayId,
          postedAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }
}

export const storage = new DatabaseStorage();
