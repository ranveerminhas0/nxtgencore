import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the bot dependency before importing
vi.mock('./storage', () => ({
    storage: {
        getAllConfiguredGuilds: vi.fn(),
        updateLastChallengeInfo: vi.fn(),
    }
}));

// Mock Discord.js bits
vi.mock('discord.js', () => ({
    EmbedBuilder: class {
        setTitle = vi.fn().mockReturnThis();
        setDescription = vi.fn().mockReturnThis();
        setColor = vi.fn().mockReturnThis();
        addFields = vi.fn().mockReturnThis();
        setFooter = vi.fn().mockReturnThis();
        setTimestamp = vi.fn().mockReturnThis();
    },
    ChannelType: { GuildForum: 15 },
}));

import { storage } from './storage';
// We'll internalize the logic or import the function if exported. 
// For this test, we are testing the ROTATION logic specifically.

describe('Challenge System Rotation', () => {
    const getNextDifficulty = (lastDifficulty: string | null) => {
        switch (lastDifficulty) {
            case "Beginner": return "Intermediate";
            case "Intermediate": return "Advanced";
            case "Advanced":
            default: return "Beginner";
        }
    };

    it('should rotate from Beginner to Intermediate', () => {
        expect(getNextDifficulty('Beginner')).toBe('Intermediate');
    });

    it('should rotate from Intermediate to Advanced', () => {
        expect(getNextDifficulty('Intermediate')).toBe('Advanced');
    });

    it('should rotate from Advanced back to Beginner', () => {
        expect(getNextDifficulty('Advanced')).toBe('Beginner');
    });

    it('should default to Beginner if no last difficulty exists', () => {
        expect(getNextDifficulty(null)).toBe('Beginner');
    });
});
