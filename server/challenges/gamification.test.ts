import { describe, it, expect, vi, beforeEach } from 'vitest';
import { awardPoints, applyFailurePenalty } from './gamification';
import { db } from '../db';

// Extremely basic mock for Drizzle ORM transaction block
vi.mock('../db', () => ({
    db: {
        transaction: vi.fn((cb) => cb({
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnValue([{
                totalPoints: 100,
                currentStreak: 2,
                bestStreak: 2
            }]),
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis()
        }))
    }
}));

// Mock drizzle-orm sql helpers
vi.mock('drizzle-orm', () => ({
    eq: vi.fn(),
    and: vi.fn(),
    sql: vi.fn()
}));

describe('Gamification System', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should award correct points and increment streak', async () => {
        const result = await awardPoints(BigInt(1), BigInt(10), 5, 2);

        expect(result.pointsAwarded).toBe(60); // Attempt 2 is 60 points
        expect(result.currentStreak).toBe(3); // Mock provides 2 -> 3
        expect(result.totalPoints).toBe(160); // 100 + 60
    });

    it('should deduct penalty points and reset streak on failure', async () => {
        const result = await applyFailurePenalty(BigInt(1), BigInt(10));

        expect(result.pointsDeducted).toBe(20);
        expect(result.totalPoints).toBe(80); // 100 - 20
    });
});
