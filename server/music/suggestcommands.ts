/**
 * Song Suggestion Feature — /suggest command
 * 
 * Users can suggest songs via name or link (Spotify, YouTube, Apple Music).
 * Bot scrapes metadata, shows an ephemeral preview, and on confirm posts
 * a public embed with cross-platform redirect buttons.
 */

import { ChatInputCommandInteraction, ButtonInteraction } from "discord.js";
import { execFile } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";
import { logInfo, logError } from "../logger";

const exec = promisify(execFile);

/* TYPES */

interface SongMetadata {
    title: string;
    artist: string;
    duration: string;
    thumbnail: string;
    sourceUrl: string;
    youtubeUrl?: string;
    platform: "spotify" | "youtube" | "apple_music" | "search";
}

/* PLATFORM DETECTION */

type Platform = "spotify" | "youtube" | "apple_music" | "search";

function detectPlatform(query: string): Platform {
    const trimmed = query.trim();

    if (/^https?:\/\/(open\.)?spotify\.com\//i.test(trimmed)) return "spotify";
    if (/^https?:\/\/music\.apple\.com\//i.test(trimmed)) return "apple_music";
    if (
        /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//i.test(trimmed)
    ) return "youtube";

    return "search";
}

/* METADATA SCRAPERS */

/**
 * Scrape OpenGraph meta tags from a public URL (Spotify, Apple Music).
 */
async function scrapeOGTags(url: string): Promise<{
    title?: string;
    description?: string;
    image?: string;
}> {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
            },
            timeout: 10000,
        });

        if (!res.ok) return {};

        const html = await res.text();

        const getOG = (property: string): string | undefined => {
            const regex = new RegExp(
                `<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property}["']`,
                "i"
            );
            const match = html.match(regex);
            return match?.[1] || match?.[2];
        };

        return {
            title: getOG("title"),
            description: getOG("description"),
            image: getOG("image"),
        };
    } catch (err) {
        logError("OG tag scrape failed", err);
        return {};
    }
}

/**
 * Fetch metadata from YouTube via yt-dlp (search or direct link).
 */
async function fetchYouTubeMetadata(
    query: string,
    isUrl: boolean
): Promise<SongMetadata | null> {
    try {
        const searchArg = isUrl ? query : `ytsearch1:${query}`;

        const { stdout } = await exec("yt-dlp", [
            searchArg,
            "-4",
            "--cookies", "cookies.txt",
            "--remote-components", "ejs:github",
            "--print",
            "%(title)s|%(webpage_url)s|%(duration_string)s|%(thumbnail)s|%(uploader)s",
            "--no-playlist",
            "--quiet",
        ]);

        const line = stdout.trim();
        if (!line) return null;

        const parts = line.split("|");
        if (parts.length < 5) {
            logError("yt-dlp suggest: malformed output", { stdout });
            return null;
        }

        const uploader = parts.pop()?.trim() || "Unknown";
        const thumbnail = parts.pop()?.trim() || "";
        const duration = parts.pop()?.trim() || "N/A";
        const url = parts.pop()?.trim() || "";
        const title = parts.join("|").trim();

        if (!url || !url.startsWith("http")) {
            logError("yt-dlp suggest: non-URL result", { title, url });
            return null;
        }

        return {
            title,
            artist: uploader,
            duration,
            thumbnail,
            sourceUrl: url,
            platform: isUrl ? "youtube" : "search",
        };
    } catch (err) {
        logError("yt-dlp suggest search failed", err);
        return null;
    }
}

/**
 * Fetch metadata from a Spotify track page via OG tags.
 */
async function fetchSpotifyMetadata(url: string): Promise<SongMetadata | null> {
    const og = await scrapeOGTags(url);
    if (!og.title) return null;

    let artist = "Unknown Artist";
    let title = og.title || "Unknown";

    // Flexible regex for Spotify titles: "Title - song by Artist | Spotify" or "Title - Artist"
    const titleMatch = title.match(/^(.+?)\s*[-–|]\s*(?:song\s*by\s+)?(.+?)(?:\s*[|–-].*)?$/i);
    if (titleMatch) {
        title = titleMatch[1].trim();
        artist = titleMatch[2].trim();
    } else if (og.description) {
        const descParts = og.description.split("·").map((s) => s.trim());
        if (descParts.length >= 2) {
            artist = descParts[1] || artist;
        }
    }

    return {
        title,
        artist,
        duration: "—",
        thumbnail: og.image || "",
        sourceUrl: url,
        platform: "spotify",
    };
}

/**
 * Fetch metadata from an Apple Music track page via OG tags.
 */
async function fetchAppleMusicMetadata(url: string): Promise<SongMetadata | null> {
    const og = await scrapeOGTags(url);
    if (!og.title) return null;

    let title = og.title || "Unknown";
    let artist = "Unknown Artist";

    const titleMatch = title.match(/^(.+?)\s+by\s+(.+?)\s+on\s+Apple\s+Music$/i);
    if (titleMatch) {
        title = titleMatch[1].trim();
        artist = titleMatch[2].trim();
    } else if (og.description) {
        const descMatch = og.description.match(/by\s+(.+?)(?:\s+on|\s*$)/i);
        if (descMatch) {
            artist = descMatch[1].trim();
        }
    }

    return {
        title,
        artist,
        duration: "—",
        thumbnail: og.image || "",
        sourceUrl: url,
        platform: "apple_music",
    };
}

/* MAIN RESOLVER */

async function resolveMetadata(query: string): Promise<SongMetadata | null> {
    const platform = detectPlatform(query);
    let metadata: SongMetadata | null = null;

    switch (platform) {
        case "spotify":
            metadata = await fetchSpotifyMetadata(query.trim());
            break;
        case "apple_music":
            metadata = await fetchAppleMusicMetadata(query.trim());
            break;
        case "youtube":
            metadata = await fetchYouTubeMetadata(query.trim(), true);
            break;
        case "search":
            metadata = await fetchYouTubeMetadata(query.trim(), false);
            break;
    }

    // Fallback: If scraper failed, try a general search
    if (!metadata && (platform === "spotify" || platform === "apple_music")) {
        logInfo(`[Suggest] Metadata scrape failed for ${platform}, trying YouTube search fallback.`);
        metadata = await fetchYouTubeMetadata(query.trim(), false);
    }

    // Direct YouTube Link Resolution: If base platform isn't YouTube, find the link
    if (metadata && metadata.platform !== "youtube") {
        try {
            const ytSearch = await fetchYouTubeMetadata(`${metadata.title} ${metadata.artist}`, false);
            if (ytSearch) {
                metadata.youtubeUrl = ytSearch.sourceUrl;
            }
        } catch (err) {
            logError("YouTube cross-resolve failed", err);
        }
    }

    return metadata;
}

/* BUTTON LINK BUILDER */

interface PlatformButton {
    label: string;
    url: string;
    emoji?: string;
}

function buildPlatformButtons(meta: SongMetadata): PlatformButton[] {
    const searchQuery = encodeURIComponent(`${meta.title} ${meta.artist}`);
    const buttons: PlatformButton[] = [];

    const spotifySearchUrl = `https://open.spotify.com/search/${searchQuery}`;
    const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;

    switch (meta.platform) {
        case "spotify":
            buttons.push({ label: "Spotify", url: meta.sourceUrl, emoji: "<:spotifySVG:1478361051304169554>" });
            buttons.push({
                label: "YouTube",
                url: meta.youtubeUrl || youtubeSearchUrl,
                emoji: "<:YouTubeMusicSVG:1478361394972856435>"
            });
            break;
        case "youtube":
        case "search":
            buttons.push({ label: "YouTube", url: meta.sourceUrl, emoji: "<:YouTubeMusicSVG:1478361394972856435>" });
            buttons.push({ label: "Spotify", url: spotifySearchUrl, emoji: "<:spotifySVG:1478361051304169554>" });
            break;
        case "apple_music":
            buttons.push({ label: "Apple Music", url: meta.sourceUrl, emoji: "<:applemusicSVG:1478361911799189575>" });
            buttons.push({ label: "Spotify", url: spotifySearchUrl, emoji: "<:spotifySVG:1478361051304169554>" });
            buttons.push({
                label: "YouTube",
                url: meta.youtubeUrl || youtubeSearchUrl,
                emoji: "<:YouTubeMusicSVG:1478361394972856435>"
            });
            break;
    }

    return buttons;
}

/* PENDING CONFIRMATION CACHE */

const pendingSuggestions = new Map<
    string,
    { metadata: SongMetadata; channelId: string; userId: string; timestamp: number }
>();

setInterval(() => {
    const now = Date.now();
    Array.from(pendingSuggestions.entries()).forEach(([key, value]) => {
        if (now - value.timestamp > 2 * 60 * 1000) {
            pendingSuggestions.delete(key);
        }
    });
}, 5 * 60 * 1000);

/* COMMAND HANDLER */

export async function handleSuggest(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    const query = interaction.options.getString("query", true);

    await interaction.deferReply({ ephemeral: true });

    try {
        const metadata = await resolveMetadata(query);

        if (!metadata) {
            await interaction.editReply("<:redcrossSVG:1478378301235007599> Couldn't find that song. Try a different search or check the link.");
            return;
        }

        const cacheKey = interaction.user.id;
        pendingSuggestions.set(cacheKey, {
            metadata,
            channelId: interaction.channelId,
            userId: interaction.user.id,
            timestamp: Date.now(),
        });

        logInfo(`[Suggest] Found: "${metadata.title}" by ${metadata.artist} for ${interaction.user.username}`);

        // Build ephemeral preview with neutral style buttons
        const previewPayload: any = {
            flags: 32768, // IS_COMPONENTS_V2
            components: [
                {
                    type: 17, // CONTAINER
                    accent_color: 0x1DB954,
                    components: [
                        {
                            type: 10,
                            content: "<:MUSIC_PNG_JPEG_SVG:1478363626833186918> **Song Preview**",
                        },
                        ...(metadata.thumbnail
                            ? [
                                {
                                    type: 9, // SECTION
                                    accessory: {
                                        type: 11, // THUMBNAIL
                                        media: { url: metadata.thumbnail },
                                    },
                                    components: [
                                        {
                                            type: 10, // TEXT_DISPLAY
                                            content: `**${metadata.title}**\nby **${metadata.artist}**\n\n**Duration:** ${metadata.duration}`,
                                        },
                                    ],
                                },
                            ]
                            : [
                                {
                                    type: 10, // TEXT_DISPLAY
                                    content: `**${metadata.title}**\nby **${metadata.artist}**\n\n**Duration:** ${metadata.duration}`,
                                },
                            ]),
                        { type: 14, spacing: 1 },
                        {
                            type: 10, // TEXT_DISPLAY
                            content: "*Click **Confirm** to suggest this song to the channel, or **Cancel** to dismiss.*",
                        },
                        {
                            type: 1, // ACTION_ROW
                            components: [
                                {
                                    type: 2, // BUTTON
                                    style: 2, // SECONDARY
                                    emoji: "<:greentickSVG:1478364237263798354>",
                                    label: "Confirm",
                                    custom_id: "suggest_confirm",
                                },
                                {
                                    type: 2, // BUTTON
                                    style: 2, // SECONDARY
                                    emoji: "<:redcrossSVG:1478365693081681930>",
                                    label: "Cancel",
                                    custom_id: "suggest_cancel",
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        await interaction.editReply(previewPayload);
    } catch (err) {
        logError("Suggest command failed", err);
        await interaction.editReply("<:redcrossSVG:1478378301235007599> Something went wrong while fetching song details.");
    }
}

/* BUTTON HANDLER */

export async function handleSuggestButton(
    interaction: ButtonInteraction
): Promise<void> {
    const cacheKey = interaction.user.id;
    const pending = pendingSuggestions.get(cacheKey);

    if (interaction.customId === "suggest_cancel") {
        pendingSuggestions.delete(cacheKey);
        await interaction.update({
            flags: 32768, // IS_COMPONENTS_V2
            components: [{
                type: 17, // CONTAINER
                components: [{ type: 10, content: "<:redcrossSVG:1478378301235007599> Suggestion cancelled." }]
            }],
        } as any);
        return;
    }

    if (interaction.customId === "suggest_confirm") {
        if (!pending) {
            await interaction.update({
                flags: 32768, // IS_COMPONENTS_V2
                components: [{
                    type: 17, // CONTAINER
                    components: [{ type: 10, content: "<:redcrossSVG:1478378301235007599> Suggestion expired. Please run `/suggest` again." }]
                }],
            } as any);
            return;
        }

        const metadata = pending.metadata;
        pendingSuggestions.delete(cacheKey);

        await interaction.update({
            flags: 32768, // IS_COMPONENTS_V2
            components: [{
                type: 17, // CONTAINER
                components: [{ type: 10, content: "<:greentickSVG:1478391400155320351> Your suggestion has been posted!" }]
            }],
        } as any);

        const platformButtons = buildPlatformButtons(metadata);
        const linkButtonsRaw = platformButtons.map((btn) => ({
            type: 2, // BUTTON
            style: 5, // LINK
            emoji: btn.emoji,
            label: btn.label,
            url: btn.url,
        }));

        const publicPayload: any = {
            flags: 32768, // IS_COMPONENTS_V2
            components: [
                {
                    type: 17, // CONTAINER
                    accent_color: 0x1DB954,
                    components: [
                        {
                            type: 10,
                            content: "<:MUSIC_PNG_JPEG_SVG:1478363626833186918> **Song Suggestion**",
                        },
                        ...(metadata.thumbnail
                            ? [
                                {
                                    type: 9, // SECTION
                                    accessory: {
                                        type: 11, // THUMBNAIL
                                        media: { url: metadata.thumbnail },
                                    },
                                    components: [
                                        {
                                            type: 10, // TEXT_DISPLAY
                                            content: `**${metadata.title}**\nby **${metadata.artist}**\n\n**Duration:** ${metadata.duration}\n*Suggested by <@${interaction.user.id}>*`,
                                        },
                                    ],
                                },
                            ]
                            : [
                                {
                                    type: 10, // TEXT_DISPLAY
                                    content: `**${metadata.title}**\nby **${metadata.artist}**\n\n**Duration:** ${metadata.duration}\n*Suggested by <@${interaction.user.id}>*`,
                                },
                            ]),
                        { type: 14, spacing: 1 },
                        {
                            type: 1, // ACTION_ROW
                            components: linkButtonsRaw,
                        },
                    ],
                },
            ],
        };

        try {
            const channel = await interaction.client.channels.fetch(pending.channelId);
            if (channel && "send" in channel) {
                await (channel as any).send(publicPayload);
                logInfo(`[Suggest] Posted: "${metadata.title}" by ${metadata.artist} — suggested by ${interaction.user.username}`);
            }
        } catch (err) {
            logError("Failed to post suggestion to channel", err);
        }
    }
}
