import { describe, it, expect, beforeEach } from 'vitest';
import { getQueue, addTrack, removeFirstTrack, clearQueue, isQueueEmpty, Track } from './queue';

describe('Music Queue', () => {
    const guildId = 'test-guild-123';
    const track1: Track = { title: 'Song 1', url: 'http://test.com/1', requestedBy: 'user1' };
    const track2: Track = { title: 'Song 2', url: 'http://test.com/2', requestedBy: 'user2' };

    beforeEach(() => {
        clearQueue(guildId);
    });

    it('should initialize an empty queue', () => {
        expect(getQueue(guildId)).toEqual([]);
        expect(isQueueEmpty(guildId)).toBe(true);
    });

    it('should add tracks to the queue', () => {
        addTrack(guildId, track1);
        addTrack(guildId, track2);

        const queue = getQueue(guildId);
        expect(queue.length).toBe(2);
        expect(queue[0]).toEqual(track1);
        expect(queue[1]).toEqual(track2);
        expect(isQueueEmpty(guildId)).toBe(false);
    });

    it('should remove the first track', () => {
        addTrack(guildId, track1);
        addTrack(guildId, track2);

        const removed = removeFirstTrack(guildId);
        expect(removed).toEqual(track1);

        const queue = getQueue(guildId);
        expect(queue.length).toBe(1);
        expect(queue[0]).toEqual(track2);
    });

    it('should return undefined when removing from empty queue', () => {
        const removed = removeFirstTrack(guildId);
        expect(removed).toBeUndefined();
    });

    it('should clear the queue for a specific guild', () => {
        addTrack(guildId, track1);
        clearQueue(guildId);
        expect(isQueueEmpty(guildId)).toBe(true);
    });
});
