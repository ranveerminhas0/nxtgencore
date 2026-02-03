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
        // Fetch the message
        const message = await (interaction.channel as TextChannel).messages.fetch(messageId);

        if (!message.stickers || message.stickers.size === 0) {
            await interaction.editReply({
                content: "❌ No sticker found in this message",
            });
            return;
        }

        // Get the first sticker
        const sticker = message.stickers.first()!;
        const stickerUrl = getStickerUrl(sticker.id, sticker.format);

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
                                    content: `### 🎨 Sticker Found!\n**📛 Name:** ${sticker.name}\n**🆔 ID:** ${sticker.id}\n**Format:** ${sticker.format === 2 ? "Animated (APNG)" : sticker.format === 4 ? "GIF" : "Static (PNG)"}`
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
                                    custom_id: `sticker_upload_${sticker.id}_${sticker.format}_${sticker.name}`
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
