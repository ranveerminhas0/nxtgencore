import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseStorage } from './storage';

// Mock DB and Schema
vi.mock('./db', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    }
}));

import { db } from './db';

describe('DatabaseStorage', () => {
    let storage: DatabaseStorage;
    const mockDb = db as any;

    beforeEach(() => {
        storage = new DatabaseStorage();
        vi.clearAllMocks();
    });

    describe('getUser', () => {
        it('should return user if found', async () => {
            const mockUser = {
                id: 1,
                discordId: BigInt(123),
                guildId: BigInt(456),
                username: 'testuser',
                isActive: true
            };

            // Mock chain: db.select().from().where() -> [user]
            const whereMock = vi.fn().mockReturnValue([mockUser]);
            const fromMock = vi.fn().mockReturnValue({ where: whereMock });
            mockDb.select.mockReturnValue({ from: fromMock });

            const result = await storage.getUser(BigInt(456), BigInt(123));
            expect(result).toEqual(mockUser);
        });

        it('should return undefined if not found', async () => {
            // Mock chain returning empty array
            const whereMock = vi.fn().mockReturnValue([]);
            const fromMock = vi.fn().mockReturnValue({ where: whereMock });
            mockDb.select.mockReturnValue({ from: fromMock });

            const result = await storage.getUser(BigInt(456), BigInt(123));
            expect(result).toBeUndefined();
        });
    });

    describe('upsertUser', () => {
        it('should insert or update user and return result', async () => {
            const newUser = {
                id: 1,
                discordId: BigInt(123),
                guildId: BigInt(456),
                username: 'newuser',
                isActive: true
            };

            // Mock chain: db.insert().values().onConflictDoUpdate().returning() -> [user]
            const returningMock = vi.fn().mockReturnValue([newUser]);
            const onConflictMock = vi.fn().mockReturnValue({ returning: returningMock });
            const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
            mockDb.insert.mockReturnValue({ values: valuesMock });

            const result = await storage.upsertUser(BigInt(456), BigInt(123), 'newuser');
            expect(result).toEqual(newUser);
            expect(mockDb.insert).toHaveBeenCalled();
        });
    });

    describe('updateIntroduction', () => {
        it('should update user intro message ID', async () => {
            const updatedUser = {
                discordId: BigInt(123),
                introductionMessageId: BigInt(999)
            };

            // Mock chain: db.update().set().where().returning() -> [user]
            const returningMock = vi.fn().mockReturnValue([updatedUser]);
            const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
            const setMock = vi.fn().mockReturnValue({ where: whereMock });
            mockDb.update.mockReturnValue({ set: setMock });

            const result = await storage.updateIntroduction(BigInt(456), BigInt(123), BigInt(999));
            expect(result).toEqual(updatedUser);
        });
    });

    describe('updateLastChallengeInfo', () => {
        it('should update challenge info for a guild', async () => {
            const date = new Date();

            // Mock chain: db.update().set().where()
            const whereMock = vi.fn().mockReturnValue(Promise.resolve());
            const setMock = vi.fn().mockReturnValue({ where: whereMock });
            mockDb.update.mockReturnValue({ set: setMock });

            await storage.updateLastChallengeInfo(BigInt(456), 'Beginner', date);

            expect(mockDb.update).toHaveBeenCalled();
            expect(setMock).toHaveBeenCalledWith({
                lastChallengeDifficulty: 'Beginner',
                lastChallengePostedAt: date
            });
        });
    });

    describe('getPostedChallengeIds', () => {
        it('should return posted challenge IDs for a guild', async () => {
            const whereMock = vi.fn().mockReturnValue([
                { challengeId: 'b1' },
                { challengeId: 'i2' },
            ]);
            const fromMock = vi.fn().mockReturnValue({ where: whereMock });
            mockDb.select.mockReturnValue({ from: fromMock });

            const result = await storage.getPostedChallengeIds(BigInt(456));
            expect(result).toEqual(['b1', 'i2']);
        });
    });

    describe('recordGuildChallenge', () => {
        it('should insert posted challenge ID idempotently', async () => {
            const onConflictDoNothingMock = vi.fn().mockReturnValue(Promise.resolve());
            const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });
            mockDb.insert.mockReturnValue({ values: valuesMock });

            await storage.recordGuildChallenge(BigInt(456), 'b1');

            expect(mockDb.insert).toHaveBeenCalled();
            expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
                guildId: BigInt(456),
                challengeId: 'b1',
            }));
        });
    });

    describe('setChallengePoolExhaustedNoticeSent', () => {
        it('should update exhaustion notice flag for a guild', async () => {
            const whereMock = vi.fn().mockReturnValue(Promise.resolve());
            const setMock = vi.fn().mockReturnValue({ where: whereMock });
            mockDb.update.mockReturnValue({ set: setMock });

            await storage.setChallengePoolExhaustedNoticeSent(BigInt(456), true);

            expect(mockDb.update).toHaveBeenCalled();
            expect(setMock).toHaveBeenCalledWith({
                challengePoolExhaustedNoticeSent: true,
            });
        });
    });

});
