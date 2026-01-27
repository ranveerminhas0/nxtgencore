import { users, giveawaysPosted, type User, type InsertUser, type InsertGiveawayPosted } from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull } from "drizzle-orm";

export interface IStorage {
  getUsers(): Promise<User[]>;
  getUser(discordId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserOnRejoin(discordId: string): Promise<User | undefined>;
  markUserInactive(discordId: string): Promise<User | undefined>;
  updateUserStatus(
    discordId: string,
    status: string,
    warned?: boolean
  ): Promise<User | undefined>;
  updateIntroduction(
    discordId: string,
    messageId: string
  ): Promise<User | undefined>;
  removeUser(discordId: string): Promise<void>;
  updateResolvedGiveaway(giveawayId: string, url: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUser(discordId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.discordId, discordId));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        warned: insertUser.warned ?? false,
        isActive: true,
      })
      .onConflictDoNothing()
      .returning();

    if (!user) {
      throw new Error("User already exists");
    }

    return user;
  }

  async updateUserOnRejoin(
    discordId: string
  ): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        joinedAt: new Date(),
        status: "pending",
        warned: false,
        isActive: true,
      })
      .where(eq(users.discordId, discordId))
      .returning();

    return updated;
  }

  async markUserInactive(
    discordId: string
  ): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.discordId, discordId))
      .returning();

    return updated;
  }

  async updateUserStatus(
    discordId: string,
    status: string,
    warned?: boolean
  ): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ status, ...(warned !== undefined ? { warned } : {}) })
      .where(eq(users.discordId, discordId))
      .returning();

    return user;
  }



  async updateIntroduction(
    discordId: string,
    messageId: string
  ): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ introductionMessageId: messageId })
      .where(
        and(
          eq(users.discordId, discordId),
          isNull(users.introductionMessageId)
        )
      )
      .returning();

    return updated;
  }

  async removeUser(discordId: string): Promise<void> {
    await db.delete(users).where(eq(users.discordId, discordId));
  }

  async existsGiveaway(giveawayId: string): Promise<boolean> {
    const [giveaway] = await db
      .select()
      .from(giveawaysPosted)
      .where(eq(giveawaysPosted.giveawayId, giveawayId));
    return !!giveaway;
  }

  async insertGiveawayPosted(
    giveawayId: string,
    resolvedUrl?: string
  ): Promise<void> {
    await db.insert(giveawaysPosted).values({
      giveawayId,
      resolvedUrl,
      resolvedAt: resolvedUrl ? new Date() : null,
    });
  }

  async updateResolvedGiveaway(giveawayId: string, url: string): Promise<void> {
    await db.update(giveawaysPosted)
      .set({
        resolvedUrl: url,
        resolvedAt: new Date()
      })
      .where(eq(giveawaysPosted.giveawayId, giveawayId));
  }
}

export const storage = new DatabaseStorage();