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
                discordId: 123n,
                guildId: 456n,
                username: 'testuser',
                isActive: true
            };

            // Mock chain: db.select().from().where() -> [user]
            const whereMock = vi.fn().mockReturnValue([mockUser]);
            const fromMock = vi.fn().mockReturnValue({ where: whereMock });
            mockDb.select.mockReturnValue({ from: fromMock });

            const result = await storage.getUser(456n, 123n);
            expect(result).toEqual(mockUser);
        });

        it('should return undefined if not found', async () => {
            // Mock chain returning empty array
            const whereMock = vi.fn().mockReturnValue([]);
            const fromMock = vi.fn().mockReturnValue({ where: whereMock });
            mockDb.select.mockReturnValue({ from: fromMock });

            const result = await storage.getUser(456n, 123n);
            expect(result).toBeUndefined();
        });
    });

    describe('upsertUser', () => {
        it('should insert or update user and return result', async () => {
            const newUser = {
                id: 1,
                discordId: 123n,
                guildId: 456n,
                username: 'newuser',
                isActive: true
            };

            // Mock chain: db.insert().values().onConflictDoUpdate().returning() -> [user]
            const returningMock = vi.fn().mockReturnValue([newUser]);
            const onConflictMock = vi.fn().mockReturnValue({ returning: returningMock });
            const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
            mockDb.insert.mockReturnValue({ values: valuesMock });

            const result = await storage.upsertUser(456n, 123n, 'newuser');
            expect(result).toEqual(newUser);
            expect(mockDb.insert).toHaveBeenCalled();
        });
    });

    describe('updateIntroduction', () => {
        it('should update user intro message ID', async () => {
            const updatedUser = {
                discordId: 123n,
                introductionMessageId: 999n
            };

            // Mock chain: db.update().set().where().returning() -> [user]
            const returningMock = vi.fn().mockReturnValue([updatedUser]);
            const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
            const setMock = vi.fn().mockReturnValue({ where: whereMock });
            mockDb.update.mockReturnValue({ set: setMock });

            const result = await storage.updateIntroduction(456n, 123n, 999n);
            expect(result).toEqual(updatedUser);
        });
    });

});
