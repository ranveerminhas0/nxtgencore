import { describe, it, expect, vi, beforeEach } from 'vitest';
import { joinVoiceChannel } from '@discordjs/voice';
import { joinChannel, isPlaying, getConnection, lockPlayer, unlockPlayer, isPlayerLocked, setPauseState, isPaused } from './player';

vi.mock('@discordjs/voice', () => ({
    joinVoiceChannel: vi.fn(),
    createAudioPlayer: vi.fn(() => ({
        on: vi.fn(),
        play: vi.fn(),
        stop: vi.fn(),
        pause: vi.fn(),
        unpause: vi.fn(),
        removeAllListeners: vi.fn(),
        state: { status: 'idle' }
    })),
    createAudioResource: vi.fn(),
    AudioPlayerStatus: { Playing: 'playing', Idle: 'idle' },
    StreamType: { Raw: 'raw', Arbitrary: 'arbitrary' },
    NoSubscriberBehavior: { Play: 'play' },
}));

vi.mock('../logger', () => ({
    logInfo: vi.fn(),
    logError: vi.fn(),
    logWarn: vi.fn(),
}));

describe('Music Player', () => {
    const guildId = 'guild123';
    const channelId = 'channel123';
    const creator = {};

    beforeEach(() => {
        vi.clearAllMocks();
        unlockPlayer(guildId);
        setPauseState(guildId, false);
    });

    it('should join channel successfully', () => {
        const mockConnection = { on: vi.fn(), subscribe: vi.fn(), state: {}, destroy: vi.fn() };
        vi.mocked(joinVoiceChannel).mockReturnValue(mockConnection as any);

        const connection = joinChannel(guildId, channelId, creator);
        expect(joinVoiceChannel).toHaveBeenCalledWith({ guildId, channelId, adapterCreator: creator, selfDeaf: true });
        expect(connection).toBe(mockConnection);
        expect(getConnection(guildId)).toBe(mockConnection);
    });

    it('lock and unlock functions should update state', () => {
        expect(isPlayerLocked(guildId)).toBe(false);
        lockPlayer(guildId);
        expect(isPlayerLocked(guildId)).toBe(true);
        unlockPlayer(guildId);
        expect(isPlayerLocked(guildId)).toBe(false);
    });

    it('pause state tracking should work', () => {
        expect(isPaused(guildId)).toBe(false);
        setPauseState(guildId, true);
        expect(isPaused(guildId)).toBe(true);
    });

    it('isPlaying should return false if no active player', () => {
        expect(isPlaying('random-guild')).toBe(false);
    });
});
