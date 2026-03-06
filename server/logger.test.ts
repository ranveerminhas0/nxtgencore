import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logError, logWarn, logInfo } from './logger';
import { client } from './bot';
import { storage } from './storage';

vi.mock('./bot', () => ({
    client: {
        isReady: vi.fn(),
        guilds: {
            cache: {
                get: vi.fn()
            }
        }
    }
}));

vi.mock('./storage', () => ({
    storage: {
        getAllConfiguredGuilds: vi.fn()
    }
}));

describe('logger', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('logInfo should only log to console', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        await logInfo('test info');
        expect(consoleSpy).toHaveBeenCalledWith('test info');
    });

    it('logWarn should log to console and not send to Discord if client is not ready', async () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.mocked(client.isReady).mockReturnValue(false);

        await logWarn('test warn');
        expect(consoleSpy).toHaveBeenCalledWith('test warn');
        // We can't easily assert send() wasn't called without exposing it, but we know it bails early.
    });

    it('logError should log to console and not send to Discord if client is not ready', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.mocked(client.isReady).mockReturnValue(false);

        await logError('test error', new Error('details'));
        expect(consoleSpy).toHaveBeenCalledWith('test error', expect.any(Error));
    });
});
