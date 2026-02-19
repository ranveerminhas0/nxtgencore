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

// Fetch Quote of the Day from ZenQuotes API with alternating tags
export async function fetchQuoteOfTheDay(): Promise<Quote> {
    const now = Date.now();
    const today = getCurrentDate();

    if (cachedQuote && cacheDate === today && now < cacheExpiry) {
        return cachedQuote;
    }

    try {
        // Alternate between 'love' and 'sad' based on the day of the year
        const dateObj = new Date();
        const startOfYear = new Date(dateObj.getFullYear(), 0, 0);
        const diff = dateObj.getTime() - startOfYear.getTime();
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = Math.floor(diff / oneDay);

        const tag = dayOfYear % 2 === 0 ? "love" : "sad";
        console.log(`[QOTD] Fetching quote with tag: ${tag} (Day of year: ${dayOfYear})`);

        // ZenQuotes tag endpoint returns a list of quotes
        const response = await fetch(`https://zenquotes.io/api/quotes/${tag}`);

        if (!response.ok) {
            throw new Error(`ZenQuotes API returned status ${response.status}`);
        }

        const data = await response.json() as Array<{ q: string; a: string }>;

        if (!data || data.length === 0) {
            throw new Error(`Empty response from ZenQuotes API for tag: ${tag}`);
        }

        // Pick a random quote from the list returned by the tag endpoint
        const randomIndex = Math.floor(Math.random() * data.length);
        const selectedQuote = data[randomIndex];

        const quote: Quote = {
            text: selectedQuote.q,
            author: selectedQuote.a,
        };

        cachedQuote = quote;
        cacheDate = today;
        // Cache until the end of the day
        cacheExpiry = now + 24 * 60 * 60 * 1000;

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
