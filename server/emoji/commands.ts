/**
 * Emoji Stealing Feature - Command Handlers
 */

import {
    ChatInputCommandInteraction,
    ButtonInteraction,
    PermissionFlagsBits,
    TextChannel,
} from "discord.js";
import fetch from "node-fetch";
import type { ParsedEmoji, ParsedSticker } from "./types";

// EMOJI PARSING UTILITIES

/**
 * Parse custom emoji from string (e.g., <:name:123456789> or <a:name:123456789>)
 */
function parseEmojis(input: string): ParsedEmoji[] {
    const emojiRegex = /<(a)?:(\w+):(\d+)>/g;
    const emojis: ParsedEmoji[] = [];
    let match;

    while ((match = emojiRegex.exec(input)) !== null) {
        const animated = match[1] === "a";
        const name = match[2];
        const id = match[3];
        emojis.push({
            id,
            name,
            animated,
            url: `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}`,
        });
    }

    return emojis;
}

/**
 * Download asset from URL and return as Buffer
 */
async function downloadAsset(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Get sticker file extension based on format type
 * 1 = PNG, 2 = APNG, 3 = LOTTIE, 4 = GIF
 */
function getStickerExtension(formatType: number): string {
    switch (formatType) {
        case 2: return "apng";
        case 3: return "json"; // Lottie
        case 4: return "gif";
        default: return "png"; // 1 or unknown
    }
}

/**
 * Download sticker - always as PNG for upload compatibility
 * Discord API has known issues with APNG uploads via discord.js
 */
async function downloadSticker(stickerId: string, formatType: number = 1): Promise<Buffer> {
    // Always try PNG first for upload compatibility (Discord API issue with APNG)
    // GIF stickers can be uploaded as-is
    const isGif = formatType === 4;

    const urls = isGif ? [
        `https://media.discordapp.net/stickers/${stickerId}.gif?size=320`,
        `https://cdn.discordapp.com/stickers/${stickerId}.gif`,
        `https://media.discordapp.net/stickers/${stickerId}.png?size=320`,
    ] : [
        // For PNG and APNG, always download as PNG (Discord converts APNG to PNG on CDN)
        `https://media.discordapp.net/stickers/${stickerId}.png?size=320`,
        `https://cdn.discordapp.com/stickers/${stickerId}.png`,
        `https://media.discordapp.net/stickers/${stickerId}.webp?size=320`,
    ];

    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                return Buffer.from(arrayBuffer);
            }
        } catch {
            continue;
        }
    }

    throw new Error("Could not download sticker from any URL");
}

/**
 * Download an image from a URL for sticker upload, trying progressively smaller sizes
 * to stay within Discord's 512KB sticker limit.
 */
async function downloadImageForSticker(url: string, isGif: boolean): Promise<Buffer> {
    // If it's a Discord CDN attachment URL, rewrite to media proxy with tiny size
    // to massively reduce file size for GIFs
    const toMediaProxyUrl = (originalUrl: string, size: number) => {
        // cdn.discordapp.com/attachments/... -> media.discordapp.net/attachments/...
        const base = originalUrl.split("?")[0].replace(
            "cdn.discordapp.com",
            "media.discordapp.net"
        );
        return `${base}?size=${size}`;
    };

    // For GIFs, try progressively smaller sizes; GIF must be under 512KB
    const sizes = isGif ? [160, 96, 64] : [320, 160];
    for (const size of sizes) {
        const proxyUrl = toMediaProxyUrl(url, size);
        try {
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const buf = Buffer.from(arrayBuffer);
                // Discord sticker limit is 512KB
                if (buf.byteLength <= 512 * 1024) {
                    return buf;
                }
            }
        } catch {
            // continue
        }
    }

    // Last resort: download original URL directly
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    if (buf.byteLength > 512 * 1024) {
        throw new Error(
            `File too large for a Discord sticker (${Math.round(buf.byteLength / 1024)}KB, max 512KB). Try a smaller GIF.`
        );
    }
    return buf;
}

/**
 * Get sticker URL for display
 */
function getStickerUrl(stickerId: string, formatType: number = 1): string {
    const ext = getStickerExtension(formatType);
    return `https://media.discordapp.net/stickers/${stickerId}.${ext}?size=320`;
}

/**
 * Check if member has permission to manage emojis
 */
function hasEmojiPermission(interaction: ChatInputCommandInteraction): boolean {
    if (!interaction.memberPermissions) return false;
    return interaction.memberPermissions.has(PermissionFlagsBits.ManageGuildExpressions);
}

// /stealemoji COMMAND

export async function handleStealEmoji(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    // Permission check
    if (!hasEmojiPermission(interaction)) {
        await interaction.reply({
            content: "❌ You don't have permission / Ask admin for stealing",
            ephemeral: true,
        });
        return;
    }

    if (!interaction.guild) {
        await interaction.reply({
            content: "❌ This command can only be used in a server",
            ephemeral: true,
        });
        return;
    }

    const emojiInput = interaction.options.getString("emojis", true);
    const upload = interaction.options.getBoolean("upload", true);

    if (!upload) {
        await interaction.reply({
            content: "❌ Set `upload` to `True` to steal the emoji",
            ephemeral: true,
        });
        return;
    }

    // Parse emojis from input
    const emojis = parseEmojis(emojiInput);

    if (emojis.length === 0) {
        await interaction.reply({
            content: "❌ No valid custom emojis found. Make sure you're using custom server emojis, not standard Unicode emojis.",
            ephemeral: true,
        });
        return;
    }

    await interaction.deferReply();

    const results: string[] = [];

    for (const emoji of emojis) {
        try {
            // Download the emoji
            const imageBuffer = await downloadAsset(emoji.url);

            // Add to guild
            const newEmoji = await interaction.guild.emojis.create({
                attachment: imageBuffer,
                name: emoji.name,
                reason: `Stolen by ${interaction.user.tag}`,
            });

            results.push(`<${emoji.animated ? "a" : ""}:${newEmoji.name}:${newEmoji.id}>`);
        } catch (error: any) {
            console.error(`Failed to steal emoji ${emoji.name}:`, error);
            results.push(`❌ Failed to add ${emoji.name}: ${error.message || "Unknown error"}`);
        }
    }

    // Build response
    const successEmojis = results.filter(r => !r.startsWith("❌"));
    const failedEmojis = results.filter(r => r.startsWith("❌"));

    let response = "";
    if (successEmojis.length > 0) {
        response += `This emoji has been added to this server\n${successEmojis.join(" ")}`;
    }
    if (failedEmojis.length > 0) {
        response += (response ? "\n\n" : "") + failedEmojis.join("\n");
    }

    await interaction.editReply({
        content: response || "❌ Failed to add any emojis",
    });
}

// /stealsticker COMMAND

export async function handleStealSticker(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    // Permission check
    if (!hasEmojiPermission(interaction)) {
        await interaction.reply({
            content: "❌ You don't have permission / Ask admin for stealing",
            ephemeral: true,
        });
        return;
    }

    if (!interaction.guild || !interaction.channel) {
        await interaction.reply({
            content: "❌ This command can only be used in a server channel",
            ephemeral: true,
        });
        return;
    }

    const messageId = interaction.options.getString("message_id", true);

    await interaction.deferReply();

    try {
        // Force fetch the message (bypass cache to get fresh data)
        const message = await (interaction.channel as TextChannel).messages.fetch({ message: messageId, force: true });

        let stickerId: string | null = null;
        let stickerName: string | null = null;
        let stickerFormat: number = 1;
        let directUrl: string | null = null; // For attachment/embed URLs

        // 1. Try discord.js stickers collection first
        if (message.stickers && message.stickers.size > 0) {
            const sticker = message.stickers.first()!;
            stickerId = sticker.id;
            stickerName = sticker.name;
            stickerFormat = sticker.format;
        }

        // 2. Fallback: Parse from message content (Discord often renders stickers as links now)
        // Format: [Name](https://media.discordapp.net/stickers/ID.png?...)
        if (!stickerId && message.content) {
            const stickerRegex = /\[(.*?)\]\(https:\/\/media\.discordapp\.net\/stickers\/(\d+)\.(png|gif|apng|webp).*\)/i;
            const match = message.content.match(stickerRegex);
            if (match) {
                stickerName = match[1];
                stickerId = match[2];
                const ext = match[3].toLowerCase();
                stickerFormat = ext === "gif" ? 4 : ext === "apng" ? 2 : 1;
            }
        }

        // 3. Fallback: check raw API sticker_items data
        if (!stickerId) {
            const rawData = (message as any).toJSON?.() || {};
            const stickerItems = rawData.stickers || rawData.sticker_items || (message as any).sticker_items;
            if (Array.isArray(stickerItems) && stickerItems.length > 0) {
                const rawSticker = stickerItems[0];
                stickerId = rawSticker.id;
                stickerName = rawSticker.name;
                stickerFormat = rawSticker.format_type || rawSticker.format || 1;
            }
        }

        // 4. Final fallback: use Discord REST API directly
        if (!stickerId) {
            try {
                const { REST, Routes } = await import("discord.js");
                const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
                const rawMsg: any = await rest.get(
                    Routes.channelMessage(interaction.channelId, messageId)
                );

                // Check raw content again from REST response
                if (rawMsg.content) {
                    const stickerRegex = /\[(.*?)\]\(https:\/\/media\.discordapp\.net\/stickers\/(\d+)\.(png|gif|apng|webp).*\)/i;
                    const match = rawMsg.content.match(stickerRegex);
                    if (match) {
                        stickerName = match[1];
                        stickerId = match[2];
                        const ext = match[3].toLowerCase();
                        stickerFormat = ext === "gif" ? 4 : ext === "apng" ? 2 : 1;
                    }
                }

                if (!stickerId) {
                    const stickerItems = rawMsg.sticker_items || rawMsg.stickers || [];
                    if (Array.isArray(stickerItems) && stickerItems.length > 0) {
                        const rawSticker = stickerItems[0];
                        stickerId = rawSticker.id;
                        stickerName = rawSticker.name;
                        stickerFormat = rawSticker.format_type || rawSticker.format || 1;
                    }
                }
            } catch (restErr) {
                console.error("REST fallback for sticker fetch failed:", restErr);
            }
        }

        // 5. Fallback: Check message attachments (animated stickers often sent as attachment files)
        if (!stickerId && message.attachments && message.attachments.size > 0) {
            const attachment = message.attachments.find(a =>
                !!(a.contentType?.startsWith("image/") ||
                    a.url.match(/\.(gif|png|jpg|jpeg|webp|apng)$/i))
            );
            if (attachment) {
                stickerId = attachment.id;
                // Discord uses snowflake IDs as filenames for uploads - detect and override
                const rawName = attachment.name?.replace(/\.[^/.]+$/, "") ?? "";
                const isSnowflake = /^\d{17,20}$/.test(rawName);
                stickerName = isSnowflake || rawName.length < 2 ? "stolen_sticker" : rawName;
                directUrl = attachment.url;
                stickerFormat = (attachment.contentType === "image/gif" || attachment.url.endsWith(".gif")) ? 4 : 1;
            }
        }

        // 6. Fallback: Check embeds (e.g. Tenor GIFs linked as embeds)
        if (!stickerId && message.embeds && message.embeds.length > 0) {
            for (const embed of message.embeds) {
                const media = embed.image || embed.thumbnail;
                if (media?.url) {
                    const urlParts = media.url.split("/");
                    const lastPart = urlParts[urlParts.length - 1].split("?")[0];
                    stickerName = lastPart.replace(/\.[^/.]+$/, "") || "stolen_gif";
                    if (stickerName.length < 2) stickerName = "stolen_gif";
                    stickerId = `embed_${message.id}`;
                    directUrl = media.url;
                    stickerFormat = media.url.includes(".gif") ? 4 : 1;
                    break;
                }
            }
        }

        if (!stickerId || !stickerName) {
            await interaction.editReply({
                content: "❌ No sticker or image found in this message.",
            });
            return;
        }

        const stickerUrl = directUrl || getStickerUrl(stickerId, stickerFormat);
        // Sanitise name for custom_id (max 100 chars, alphanumeric + underscores)
        const safeName = stickerName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20) || "sticker";
        const uploadCustomId = directUrl
            ? `img_up_${message.id}_${stickerFormat}_${safeName}`
            : `sticker_upload_${stickerId}_${stickerFormat}_${safeName}`;

        // Build V2 component response with Media Gallery for image
        const stickerPayload: any = {
            content: "",
            flags: 32768, // IS_COMPONENTS_V2
            components: [
                {
                    type: 17, // CONTAINER
                    accent_color: 0x5865F2,
                    components: [
                        {
                            type: 9, // SECTION
                            accessory: {
                                type: 11, // THUMBNAIL
                                media: { url: stickerUrl }
                            },
                            components: [
                                {
                                    type: 10, // TEXT_DISPLAY
                                    content: `### 🎨 Sticker Found!\n**📛 Name:** ${stickerName}\n**🆔 ID:** ${stickerId}\n**Format:** ${stickerFormat === 2 ? "Animated (APNG)" : stickerFormat === 4 ? "GIF" : "Static (PNG)"}`
                                }
                            ]
                        },
                        {
                            type: 1, // ACTION_ROW
                            components: [
                                {
                                    type: 2, // BUTTON
                                    style: 1, // PRIMARY
                                    label: "Upload to DB",
                                    custom_id: uploadCustomId
                                },
                                {
                                    type: 2, // BUTTON
                                    style: 5, // LINK
                                    label: "Visit Bot",
                                    url: "https://nxtgenservices.online"
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        await interaction.editReply(stickerPayload);
    } catch (error: any) {
        console.error("Failed to fetch message for sticker:", error);
        await interaction.editReply({
            content: `❌ Failed to fetch message. Make sure the message ID is correct and the message is in this channel.\nError: ${error.message || "Unknown error"}`,
        });
    }
}

// /stealreactions COMMAND

export async function handleStealReactions(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    // Permission check
    if (!hasEmojiPermission(interaction)) {
        await interaction.reply({
            content: "❌ You don't have permission / Ask admin for stealing",
            ephemeral: true,
        });
        return;
    }

    if (!interaction.guild || !interaction.channel) {
        await interaction.reply({
            content: "❌ This command can only be used in a server channel",
            ephemeral: true,
        });
        return;
    }

    const messageId = interaction.options.getString("message_id", true);

    await interaction.deferReply();

    try {
        // Fetch the message
        const message = await (interaction.channel as TextChannel).messages.fetch(messageId);

        if (!message.reactions || message.reactions.cache.size === 0) {
            await interaction.editReply({
                content: "❌ No reactions found on this message",
            });
            return;
        }

        // Filter for custom emojis only (not Unicode)
        const customReactions = message.reactions.cache.filter(
            (reaction) => reaction.emoji.id !== null
        );

        if (customReactions.size === 0) {
            await interaction.editReply({
                content: "❌ No custom emojis found in reactions. Only custom server emojis can be stolen, not standard Unicode emojis.",
            });
            return;
        }

        // Send first response
        const foundPayload: any = {
            content: "",
            flags: 32768, // IS_COMPONENTS_V2
            components: [
                {
                    type: 17, // CONTAINER
                    components: [
                        {
                            type: 10, // TEXT_DISPLAY
                            content: `### Found **${customReactions.size}** custom emoji(s) in reactions:`
                        }
                    ]
                }
            ]
        };
        await interaction.editReply(foundPayload);

        // Send a V2 container for each emoji
        for (const reaction of Array.from(customReactions.values())) {
            const emoji = reaction.emoji;
            if (!emoji.id) continue;

            const animated = emoji.animated || false;
            const emojiUrl = `https://cdn.discordapp.com/emojis/${emoji.id}.${animated ? "gif" : "png"}?size=128`;

            // V2 Container for each emoji with Media Gallery
            const emojiPayload: any = {
                content: "",
                flags: 32768, // IS_COMPONENTS_V2
                components: [
                    {
                        type: 17, // CONTAINER
                        accent_color: animated ? 0xFFA500 : 0x5865F2,
                        components: [
                            {
                                type: 9, // SECTION
                                accessory: {
                                    type: 11, // THUMBNAIL
                                    media: { url: emojiUrl }
                                },
                                components: [
                                    {
                                        type: 10, // TEXT_DISPLAY
                                        content: `### ${animated ? "🎬" : "🖼️"} ${emoji.name}\n**📛 Name:** ${emoji.name || "Unknown"}\n**🆔 ID:** ${emoji.id}`
                                    }
                                ]
                            },
                            {
                                type: 1, // ACTION_ROW
                                components: [
                                    {
                                        type: 2, // BUTTON
                                        style: 1, // PRIMARY
                                        label: "Upload to DB",
                                        custom_id: `emoji_upload_${emoji.id}_${emoji.name}_${animated ? "1" : "0"}`
                                    },
                                    {
                                        type: 2, // BUTTON
                                        style: 5, // LINK
                                        label: "Visit Bot",
                                        url: "https://nxtgenservices.online"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };

            await interaction.followUp(emojiPayload);
        }
    } catch (error: any) {
        console.error("Failed to fetch message for reactions:", error);
        await interaction.editReply({
            content: `❌ Failed to fetch message. Make sure the message ID is correct and the message is in this channel.\nError: ${error.message || "Unknown error"}`,
        });
    }
}

// BUTTON INTERACTION HANDLER

export async function handleEmojiButtonInteraction(
    interaction: ButtonInteraction
): Promise<void> {
    if (!interaction.guild) {
        await interaction.reply({
            content: "❌ This can only be used in a server",
            ephemeral: true,
        });
        return;
    }

    // Check permissions
    const member = interaction.member;
    if (!member || !(member.permissions as any).has(PermissionFlagsBits.ManageGuildExpressions)) {
        await interaction.reply({
            content: "❌ You don't have permission / Ask admin for stealing",
            ephemeral: true,
        });
        return;
    }

    const customId = interaction.customId;

    try {
        if (customId.startsWith("emoji_upload_")) {
            // Parse: emoji_upload_{id}_{name}_{animated:0|1}
            const parts = customId.replace("emoji_upload_", "").split("_");
            const emojiId = parts[0];
            const emojiName = parts[1];
            const animated = parts[2] === "1";

            const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? "gif" : "png"}`;

            await interaction.deferUpdate();

            // Download and add emoji
            const imageBuffer = await downloadAsset(emojiUrl);
            const newEmoji = await interaction.guild.emojis.create({
                attachment: imageBuffer,
                name: emojiName,
                reason: `Stolen by ${interaction.user.tag}`,
            });

            // Update to show success with V2 components
            const successPayload: any = {
                content: "",
                flags: 32768, // IS_COMPONENTS_V2
                components: [
                    {
                        type: 17, // CONTAINER
                        accent_color: 0x57F287, // Green
                        components: [
                            {
                                type: 9, // SECTION
                                accessory: {
                                    type: 11, // THUMBNAIL
                                    media: { url: emojiUrl }
                                },
                                components: [
                                    {
                                        type: 10, // TEXT_DISPLAY
                                        content: `### ✅ Successfully Uploaded!\n**Emoji:** ${emojiName}\n**Added to this server**`
                                    }
                                ]
                            },
                            {
                                type: 1, // ACTION_ROW
                                components: [
                                    {
                                        type: 2, // BUTTON
                                        style: 3, // SUCCESS
                                        label: "Successfully Uploaded ✅",
                                        custom_id: `emoji_done_${emojiId}`,
                                        disabled: true
                                    },
                                    {
                                        type: 2, // BUTTON
                                        style: 5, // LINK
                                        label: "Visit Bot",
                                        url: "https://nxtgenservices.online"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };

            await interaction.editReply(successPayload);
        } else if (customId.startsWith("sticker_upload_")) {
            // Parse: sticker_upload_{id}_{format}_{name}
            const parts = customId.replace("sticker_upload_", "").split("_");
            const stickerId = parts[0];
            const formatType = parseInt(parts[1]) || 1;
            const stickerName = parts.slice(2).join("_"); // Name might have underscores

            await interaction.deferUpdate();

            // Download sticker with correct format
            const imageBuffer = await downloadSticker(stickerId, formatType);

            // Create sticker in guild
            const newSticker = await interaction.guild.stickers.create({
                file: imageBuffer,
                name: stickerName,
                tags: "stolen",
                reason: `Stolen by ${interaction.user.tag}`,
            });

            // Update to show success with V2 components
            const successPayload: any = {
                content: "",
                flags: 32768, // IS_COMPONENTS_V2
                components: [
                    {
                        type: 17, // CONTAINER
                        accent_color: 0x57F287, // Green
                        components: [
                            {
                                type: 9, // SECTION
                                accessory: {
                                    type: 11, // THUMBNAIL
                                    media: { url: getStickerUrl(stickerId, formatType) }
                                },
                                components: [
                                    {
                                        type: 10, // TEXT_DISPLAY
                                        content: `### ✅ Successfully Uploaded!\n**Sticker:** ${stickerName}\n**Added to this server**`
                                    }
                                ]
                            },
                            {
                                type: 1, // ACTION_ROW
                                components: [
                                    {
                                        type: 2, // BUTTON
                                        style: 3, // SUCCESS
                                        label: "Successfully Uploaded ✅",
                                        custom_id: `sticker_done_${stickerId}`,
                                        disabled: true
                                    },
                                    {
                                        type: 2, // BUTTON
                                        style: 5, // LINK
                                        label: "Visit Bot",
                                        url: "https://nxtgenservices.online"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };

            await interaction.editReply(successPayload);
        } else if (customId.startsWith("img_up_")) {
            // Parse: img_up_{messageId}_{format}_{name}
            // messageId can be a snowflake integer, format is a number, name is the rest
            const withoutPrefix = customId.replace("img_up_", "");
            const parts = withoutPrefix.split("_");
            const srcMessageId = parts[0];
            const formatType = parseInt(parts[1]) || 1;
            const stickerName = parts.slice(2).join("_") || "stolen";

            await interaction.deferUpdate();

            // Re-fetch the source message to get the live attachment URL
            if (!interaction.channel) throw new Error("No channel available");
            const srcMessage = await (interaction.channel as TextChannel).messages.fetch({ message: srcMessageId, force: true });

            const attachment = srcMessage.attachments.find(a =>
                !!(a.contentType?.startsWith("image/") ||
                    a.url.match(/\.(gif|png|jpg|jpeg|webp|apng)$/i))
            );

            if (!attachment) throw new Error("Attachment no longer available on that message");

            const isAttachmentGif = attachment.contentType === "image/gif" || attachment.url.endsWith(".gif");
            const imageBuffer = await downloadImageForSticker(attachment.url, isAttachmentGif);

            // Upload as sticker
            const newSticker = await interaction.guild!.stickers.create({
                file: imageBuffer,
                name: stickerName || "stolen",
                tags: "stolen",
                reason: `Stolen by ${interaction.user.tag}`,
            });

            const successPayload2: any = {
                content: "",
                flags: 32768,
                components: [
                    {
                        type: 17,
                        accent_color: 0x57F287,
                        components: [
                            {
                                type: 9,
                                accessory: { type: 11, media: { url: attachment.url } },
                                components: [
                                    {
                                        type: 10,
                                        content: `### ✅ Successfully Uploaded!\n**Sticker:** ${newSticker.name}\n**Added to this server**`
                                    }
                                ]
                            },
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 2,
                                        style: 3,
                                        label: "Successfully Uploaded ✅",
                                        custom_id: `img_done_${srcMessageId}`,
                                        disabled: true
                                    },
                                    {
                                        type: 2,
                                        style: 5,
                                        label: "Visit Bot",
                                        url: "https://nxtgenservices.online"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };

            await interaction.editReply(successPayload2);
        }
    } catch (error: any) {
        console.error("Failed to upload emoji/sticker:", error);

        // Update to show error with V2 components
        const errorPayload: any = {
            content: "",
            flags: 32768, // IS_COMPONENTS_V2
            components: [
                {
                    type: 17, // CONTAINER
                    accent_color: 0xED4245, // Red
                    components: [
                        {
                            type: 10, // TEXT_DISPLAY
                            content: `### ❌ Upload Failed\n**Error:** ${error.message?.slice(0, 100) || "Unknown error"}`
                        },
                        {
                            type: 1, // ACTION_ROW
                            components: [
                                {
                                    type: 2, // BUTTON
                                    style: 4, // DANGER
                                    label: "Failed",
                                    custom_id: `upload_failed`,
                                    disabled: true
                                },
                                {
                                    type: 2, // BUTTON
                                    style: 5, // LINK
                                    label: "Visit Bot",
                                    url: "https://nxtgenservices.online"
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        try {
            await interaction.editReply(errorPayload);
        } catch {
            await interaction.reply({
                content: `❌ Failed to upload: ${error.message || "Unknown error"}`,
                ephemeral: true,
            });
        }
    }
}
