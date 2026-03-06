import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWeather } from './commands';

const mockResponse = {
    ok: true,
    json: vi.fn()
};

vi.mock('node-fetch', () => {
    return {
        default: vi.fn(() => Promise.resolve(mockResponse))
    };
});

describe('Weather Commands', () => {
    let mockInteraction: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockInteraction = {
            options: { getString: vi.fn() },
            reply: vi.fn(),
            editReply: vi.fn(),
            deferReply: vi.fn(),
            id: 'int-123'
        };

        // Default mock response setup for API keys
        process.env.TOMORROW_API_KEY = 'test-key';
        process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    });

    it('should defer reply initially', async () => {
        mockInteraction.options.getString.mockReturnValue('London');
        mockResponse.json.mockResolvedValueOnce({ status: 'OK', results: [] }); // Google Maps fail mock
        await handleWeather(mockInteraction);
        expect(mockInteraction.deferReply).toHaveBeenCalled();
    });

    it('should handle api failure gracefully', async () => {
        mockInteraction.options.getString.mockReturnValue('InvalidLocation');
        // If geocoding fails, it returns null and edits reply
        mockResponse.json.mockResolvedValueOnce({ status: 'ZERO_RESULTS', results: [] });

        await handleWeather(mockInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('Could not find weather data')
        }));
    });
});
