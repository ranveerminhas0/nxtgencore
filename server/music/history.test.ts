import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addToHistory, getHistory, getTrackById } from './history';
import { pool } from '../db';
import { Track } from './queue';

vi.mock('../db', () => ({
    pool: {
        query: vi.fn(),
    }
}));

describe('Music History', () => {
    const guildId = 'test-guild';
    const track: Track = { title: 'Song', url: 'http://test', duration: '3:00', requestedBy: 'User' };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should insert a new track if it does not exist', async () => {
        vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any); // Check existing
        vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any); // Insert new
        vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any); // Prune

        await addToHistory(guildId, track);

        expect(pool.query).toHaveBeenCalledTimes(3);
        expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO music_history'), [guildId, track.title, track.url, track.duration, track.requestedBy]);
    });

    it('should update played_at if track exists', async () => {
        vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as any); // Check existing returns id 1
        vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any); // Update
        vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any); // Prune

        await addToHistory(guildId, track);

        expect(pool.query).toHaveBeenCalledTimes(3);
        expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE music_history SET played_at'), [1, track.requestedBy]);
    });

    it('should get history for a guild', async () => {
        const mockRows = [{ id: 1, title: 'Song', url: 'http://test' }];
        vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockRows } as any);

        const result = await getHistory(guildId);

        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM music_history'), [guildId]);
        expect(result).toEqual(mockRows);
    });

    it('should get track by ID', async () => {
        const mockRow = { id: 1, title: 'Song', url: 'http://test' };
        vi.mocked(pool.query).mockResolvedValueOnce({ rows: [mockRow] } as any);

        const result = await getTrackById(1);

        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM music_history WHERE id = $1'), [1]);
        expect(result).toEqual(mockRow);
    });

    it('should return null if track by ID is not found', async () => {
        vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

        const result = await getTrackById(99);

        expect(result).toBeNull();
    });
});
