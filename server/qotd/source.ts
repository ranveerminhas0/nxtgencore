import fetch from "node-fetch";

interface Quote {
    text: string;
    author: string;
}

// Simple in-memory cache
let cachedQuote: Quote | null = null;
let cacheDate: string | null = null;
let cacheExpiry: number = 0;

// Get current date string (YYYY-MM-DD)
function getCurrentDate(): string {
    const now = new Date();
    return now.toISOString().split("T")[0];
}

// Fetch Quote of the Day from ZenQuotes API
export async function fetchQuoteOfTheDay(): Promise<Quote> {
    const now = Date.now();
    const today = getCurrentDate();

    if (cachedQuote && cacheDate === today && now < cacheExpiry) {
        return cachedQuote;
    }

    try {
        // Endpoint for a single random quote
        const response = await fetch("https://zenquotes.io/api/random");

        if (!response.ok) {
            throw new Error(`ZenQuotes API returned status ${response.status}`);
        }

        const data = await response.json() as Array<{ q: string; a: string }>;

        if (!data || data.length === 0) {
            throw new Error("Empty response from ZenQuotes API");
        }

        const quote: Quote = {
            text: data[0].q,
            author: data[0].a,
        };

        cachedQuote = quote;
        cacheDate = today;
        cacheExpiry = now + 60 * 60 * 1000; // 1 hour

        return quote;
    } catch (error) {
        console.error("Failed to fetch quote from ZenQuotes:", error);

        // Fallback quote if API fails
        return {
            text: "The only way to do great work is to love what you do.",
            author: "Steve Jobs",
        };
    }
}
