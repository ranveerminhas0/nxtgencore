import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStealEmoji } from './commands';
import { PermissionFlagsBits } from 'discord.js';

vi.mock('node-fetch');

describe('Emoji Commands', () => {
    let mockInteraction: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockInteraction = {
            guild: {
                emojis: { create: vi.fn().mockResolvedValue({ id: '123', name: 'test_emoji' }) }
            },
            options: { getString: vi.fn(), getBoolean: vi.fn() },
            reply: vi.fn(),
            editReply: vi.fn(),
            deferReply: vi.fn(),
            user: { tag: 'User#1234' },
            memberPermissions: {
                has: vi.fn().mockReturnValue(true) // Has manage expressions perm
            }
        };
    });

    it('should block if user lacks permission', async () => {
        mockInteraction.memberPermissions.has.mockReturnValue(false);
        await handleStealEmoji(mockInteraction);
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("don't have permission") }));
    });

    it('should block if not in a server', async () => {
        mockInteraction.guild = null;
        await handleStealEmoji(mockInteraction);
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('only be used in a server') }));
    });

    it('should reject if upload is false', async () => {
        mockInteraction.options.getBoolean.mockReturnValue(false);
        await handleStealEmoji(mockInteraction);
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('upload` to `True`') }));
    });

    it('should reject if no emojis found in string', async () => {
        mockInteraction.options.getBoolean.mockReturnValue(true);
        mockInteraction.options.getString.mockReturnValue('just some text'); // No emojis
        await handleStealEmoji(mockInteraction);
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('No valid custom emojis') }));
    });
});
