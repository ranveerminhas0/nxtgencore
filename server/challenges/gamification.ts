import { db } from "../db";
import { challengeSubmissions, userChallengeStats } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

// Points awarded per attempt number
const POINTS_MAP: Record<number, number> = {
    1: 100,
    2: 60,
    3: 30,
};

const PENALTY_POINTS = 20; // Deducted when all 3 attempts fail

export interface GamificationResult {
    pointsAwarded: number;
    totalPoints: number;
    currentStreak: number;
    bestStreak: number;
}

/**
 * Award points and update streak for a correct submission.
 * Runs inside a transaction to ensure atomicity.
 */
export async function awardPoints(
    userId: bigint,
    guildId: bigint,
    submissionId: number,
    attemptNumber: number
): Promise<GamificationResult> {
    const points = POINTS_MAP[attemptNumber] ?? 30;

    return await db.transaction(async (tx) => {
        // 1. Update submission with points
        await tx
            .update(challengeSubmissions)
            .set({ pointsAwarded: points })
            .where(eq(challengeSubmissions.id, submissionId));

        // 2. Upsert user stats — increment streak + add points
        const existing = await tx
            .select()
            .from(userChallengeStats)
            .where(and(eq(userChallengeStats.userId, userId), eq(userChallengeStats.guildId, guildId)))
            .limit(1);

        if (existing.length === 0) {
            // First solve ever
            await tx.insert(userChallengeStats).values({
                userId,
                guildId,
                totalSolved: 1,
                totalPoints: points,
                currentStreak: 1,
                bestStreak: 1,
                lastSolvedAt: new Date(),
            });

            return { pointsAwarded: points, totalPoints: points, currentStreak: 1, bestStreak: 1 };
        }

        const stats = existing[0];
        const newStreak = (stats.currentStreak ?? 0) + 1;
        const newBest = Math.max(newStreak, stats.bestStreak ?? 0);
        const newTotal = (stats.totalPoints ?? 0) + points;

        await tx
            .update(userChallengeStats)
            .set({
                totalSolved: sql`${userChallengeStats.totalSolved} + 1`,
                totalPoints: newTotal,
                currentStreak: newStreak,
                bestStreak: newBest,
                lastSolvedAt: new Date(),
            })
            .where(and(eq(userChallengeStats.userId, userId), eq(userChallengeStats.guildId, guildId)));

        return { pointsAwarded: points, totalPoints: newTotal, currentStreak: newStreak, bestStreak: newBest };
    });
}

/**
 * Apply penalty when all 3 attempts fail.
 * Deducts points (floor at 0) and resets streak.
 */
export async function applyFailurePenalty(
    userId: bigint,
    guildId: bigint
): Promise<{ pointsDeducted: number; totalPoints: number }> {
    return await db.transaction(async (tx) => {
        const existing = await tx
            .select()
            .from(userChallengeStats)
            .where(and(eq(userChallengeStats.userId, userId), eq(userChallengeStats.guildId, guildId)))
            .limit(1);

        if (existing.length === 0) {
            // User has no stats — nothing to deduct
            return { pointsDeducted: 0, totalPoints: 0 };
        }

        const stats = existing[0];
        const currentPoints = stats.totalPoints ?? 0;
        const deduction = Math.min(PENALTY_POINTS, currentPoints); // Never go below 0
        const newTotal = currentPoints - deduction;

        await tx
            .update(userChallengeStats)
            .set({
                totalPoints: newTotal,
                currentStreak: 0, // Reset streak on total failure
            })
            .where(and(eq(userChallengeStats.userId, userId), eq(userChallengeStats.guildId, guildId)));

        return { pointsDeducted: deduction, totalPoints: newTotal };
    });
}
