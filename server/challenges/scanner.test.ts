import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchChallengeFromThreadName, initChallengeData } from './scanner';

// Mock fs to simulate data.json
vi.mock('fs', () => ({
    readFileSync: vi.fn().mockReturnValue(JSON.stringify({
        beginner: [
            { id: "ch1", title: "Hello World", description: "Say hi", tags: [] }
        ],
        intermediate: [],
        advanced: []
    }))
}));

describe('Challenge Scanner Extraction', () => {
    beforeEach(() => {
        initChallengeData();
    });

    it('should correctly parse thread names and match challenges', () => {
        const match = matchChallengeFromThreadName('[Beginner] Hello World');
        expect(match).not.toBeNull();
        expect(match?.id).toBe('ch1');
    });

    it('should return null for unmatched names', () => {
        const match = matchChallengeFromThreadName('[Advanced] Unknown Challenge');
        expect(match).toBeNull();
    });

    it('should return null if format is not matched', () => {
        const match = matchChallengeFromThreadName('General Chatting');
        expect(match).toBeNull();
    });
});
