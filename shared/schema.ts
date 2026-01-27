import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  discordId: text("discord_id").primaryKey(),
  username: text("username").notNull(),
  joinedAt: timestamp("joined_at").notNull(),
  status: text("status").notNull(), // 'pending', 'warned_5m', 'verified', 'veteran'
  warned: boolean("warned").default(false),
  introductionMessageId: text("introduction_message_id"),
  isActive: boolean("is_active").default(true).notNull(),
});

export const giveawaysPosted = pgTable("giveaways_posted", {
  giveawayId: text("giveaway_id").primaryKey(),
  resolvedUrl: text("resolved_url"),
  resolvedAt: timestamp("resolved_at"),
  postedAt: timestamp("posted_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users);
export const insertGiveawayPostedSchema = createInsertSchema(giveawaysPosted);

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type GiveawayPosted = typeof giveawaysPosted.$inferSelect;
export type InsertGiveawayPosted = z.infer<typeof insertGiveawayPostedSchema>;

export interface BotStatus {
  online: boolean;
  uptime: number;
  trackedUsersCount: number;
}
