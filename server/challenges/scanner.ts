import { db } from "../db";
import { challengeSubmissions } from "@shared/schema";
import { eq, and, sql, lt, or } from "drizzle-orm";
import { enqueueReview } from "./queue";
import { extractCode, type ChallengeInfo, type ReviewJob } from "./reviewer";
import type { Client, Message, TextChannel } from "discord.js";
import { storage } from "../storage";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Challenge data for lookups
let challengeData: any = null;
let challengeLookup: Map<string, ChallengeInfo> = new Map();

/**
 * Load challenge data and build a title → challenge lookup map.
 */
export function initChallengeData(): void {
    try {
        const dataPath = join(__dirname, "data.json");
        challengeData = JSON.parse(readFileSync(dataPath, "utf-8"));
        challengeLookup.clear();

        for (const difficulty of ["beginner", "intermediate", "advanced"]) {
            const pool = challengeData[difficulty];
            if (!Array.isArray(pool)) continue;
            for (const ch of pool) {
                // Key by lowercase title for matching
                challengeLookup.set(ch.title.toLowerCase(), {
                    id: ch.id,
                    title: ch.title,
                    description: ch.description,
                    solution: ch.solution || "",
                    tags: ch.tags || [],
                });
            }
        }

        console.log(`[Challenge Scanner] Loaded ${challengeLookup.size} challenges with solutions`);
    } catch (err) {
        console.error("[Challenge Scanner] Failed to load challenge data:", err);
    }
}

/**
 * Parse thread name to extract challenge info.
 * Thread format: "[Difficulty] Title"
 */
export function matchChallengeFromThreadName(threadName: string): ChallengeInfo | null {
    const match = threadName.match(/^\[(?:Beginner|Intermediate|Advanced)\]\s+(.+)$/i);
    if (!match) return null;

    const title = match[1].trim().toLowerCase();
    return challengeLookup.get(title) || null;
}

/**
 * Scan for missed challenge messages on bot startup.
 * Picks up PENDING and stale REVIEWING rows, plus unprocessed messages.
 */
export async function scanMissedChallengeMessages(client: Client): Promise<void> {
    console.log("[Challenge Scanner] Starting offline catch-up scan...");

    try {
        // 1. Retry stale REVIEWING rows (older than 30s — likely from a crash)
        const staleThreshold = new Date(Date.now() - 30_000);
        await db
            .update(challengeSubmissions)
            .set({ reviewState: "PENDING", reviewStartedAt: null })
            .where(
                and(
                    eq(challengeSubmissions.reviewState, "REVIEWING"),
                    lt(challengeSubmissions.reviewStartedAt, staleThreshold)
                )
            );

        // 2. Get all PENDING submissions and re-enqueue them
        const pendingRows = await db
            .select()
            .from(challengeSubmissions)
            .where(eq(challengeSubmissions.reviewState, "PENDING"));

        if (pendingRows.length === 0) {
            console.log("[Challenge Scanner] No pending submissions to process.");
            return;
        }

        console.log(`[Challenge Scanner] Found ${pendingRows.length} pending submissions to re-process.`);

        for (const row of pendingRows) {
            try {
                // Find the guild
                const guild = client.guilds.cache.get(row.guildId.toString());
                if (!guild) continue;

                // Find the thread
                const thread = guild.channels.cache.get(row.threadId.toString());
                if (!thread || !thread.isThread()) continue;

                // Fetch the message
                let message: Message;
                try {
                    message = await thread.messages.fetch(row.messageId.toString());
                } catch {
                    // Message was deleted — skip
                    console.log(`[Challenge Scanner] Message ${row.messageId} not found, skipping.`);
                    continue;
                }

                // Look up challenge
                const challenge = matchChallengeFromThreadName(thread.name);
                if (!challenge) continue;

                // Extract code from message
                const extracted = extractCode(message.content);
                if (!extracted) continue;

                // Count total attempts for this user in this thread
                const userAttempts = await db
                    .select()
                    .from(challengeSubmissions)
                    .where(
                        and(
                            eq(challengeSubmissions.userId, row.userId),
                            eq(challengeSubmissions.threadId, row.threadId)
                        )
                    );

                const job: ReviewJob = {
                    submissionId: row.id,
                    message,
                    challenge,
                    attemptNumber: row.attemptNumber,
                    totalAttempts: userAttempts.length,
                    detectedLanguage: extracted.language,
                    userCode: extracted.code,
                    userId: row.userId,
                    guildId: row.guildId,
                };

                enqueueReview(job);
            } catch (err) {
                console.error(`[Challenge Scanner] Error processing submission ${row.id}:`, err);
            }
        }

        console.log("[Challenge Scanner] Offline catch-up scan complete.");
    } catch (err) {
        console.error("[Challenge Scanner] Scan failed:", err);
    }
}
