import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePlay, handleSkip, handleStop, handleQueue } from './commands';
import * as queueModule from './queue';
import * as playerModule from './player';

vi.mock('child_process', () => ({
    execFile: vi.fn(),
}));

vi.mock('util', () => ({
    promisify: (fn: any) => fn,
}));

vi.mock('./queue', () => ({
    addTrack: vi.fn(),
    getQueue: vi.fn(),
    clearQueue: vi.fn(),
    isQueueEmpty: vi.fn(),
}));

vi.mock('./player', () => ({
    joinChannel: vi.fn(),
    playTrack: vi.fn(),
    stopPlayback: vi.fn(),
    destroyConnection: vi.fn(),
    getConnection: vi.fn(),
    setPlayerState: vi.fn(),
    processQueue: vi.fn(),
    isPlaying: vi.fn(),
    isPlayerLocked: vi.fn(() => false),
}));

describe('Music Commands', () => {
    let mockInteraction: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockInteraction = {
            guild: { id: 'guild123', voiceAdapterCreator: {} },
            member: { voice: { channel: { id: 'voice123', permissionsFor: vi.fn(() => ({ has: () => true })) } } },
            channel: { send: vi.fn() },
            options: { getString: vi.fn() },
            reply: vi.fn(),
            editReply: vi.fn(),
            deferReply: vi.fn(),
            user: { username: 'TestUser', displayAvatarURL: vi.fn() },
            client: { application: { commands: { cache: { find: vi.fn() } } } }
        };
    });

    it('handlePlay should guard against missing voice channel', async () => {
        mockInteraction.member.voice.channel = null;
        await handlePlay(mockInteraction);
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('You must be in a voice channel') }));
    });

    it('handleSkip should call stopPlayback', async () => {
        await handleSkip(mockInteraction);
        expect(playerModule.stopPlayback).toHaveBeenCalledWith('guild123');
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('Skipped!'));
    });

    it('handleStop should clear queue and destroy connection', async () => {
        await handleStop(mockInteraction);
        expect(queueModule.clearQueue).toHaveBeenCalledWith('guild123');
        expect(playerModule.destroyConnection).toHaveBeenCalledWith('guild123');
        expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('handleQueue should reply with empty message if queue is empty', async () => {
        vi.mocked(queueModule.getQueue).mockReturnValue([]);
        await handleQueue(mockInteraction);
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Queue is empty.' }));
    });

    it('handleQueue should list tracks if not empty', async () => {
        vi.mocked(queueModule.getQueue).mockReturnValue([{ title: 'Song 1', url: 'http://', requestedBy: 'User' }]);
        await handleQueue(mockInteraction);
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Song 1') }));
    });
});
