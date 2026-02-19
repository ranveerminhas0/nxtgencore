import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node-fetch before any imports
vi.mock("node-fetch", () => ({
    default: vi.fn(),
}));

describe("QOTD Source", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it("should fetch a quote from ZenQuotes tag API", async () => {
        const mockFetch = (await import("node-fetch")).default as any;
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [{ q: "Test quote", a: "Test author" }],
        });

        // Import after mock is set up
        const { fetchQuoteOfTheDay } = await import("./source");
        const quote = await fetchQuoteOfTheDay();

        expect(quote).toEqual({
            text: "Test quote",
            author: "Test author",
        });

        // We expect either love or sad depending on the day
        const dateObj = new Date();
        const startOfYear = new Date(dateObj.getFullYear(), 0, 0);
        const diff = dateObj.getTime() - startOfYear.getTime();
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = Math.floor(diff / oneDay);
        const tag = dayOfYear % 2 === 0 ? "love" : "sad";

        expect(mockFetch).toHaveBeenCalledWith(`https://zenquotes.io/api/quotes/${tag}`);
    });

    it("should return fallback quote when API fails", async () => {
        const mockFetch = (await import("node-fetch")).default as any;
        mockFetch.mockRejectedValueOnce(new Error("API Error"));

        // Import after mock is set up and modules are reset
        const { fetchQuoteOfTheDay } = await import("./source");
        const quote = await fetchQuoteOfTheDay();

        expect(quote).toEqual({
            text: "The only way to do great work is to love what you do.",
            author: "Steve Jobs",
        });
    });

    it("should cache quotes and reuse them", async () => {
        const mockFetch = (await import("node-fetch")).default as any;
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => [{ q: "Cached quote", a: "Cache author" }],
        });

        const { fetchQuoteOfTheDay } = await import("./source");

        // First call
        const quote1 = await fetchQuoteOfTheDay();
        // Second call should use cache
        const quote2 = await fetchQuoteOfTheDay();

        expect(quote1).toEqual(quote2);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});