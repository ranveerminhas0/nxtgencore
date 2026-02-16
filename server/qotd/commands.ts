import { EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { storage } from "../storage";
import { fetchQuoteOfTheDay } from "./source";

export async function handleQotdCommand(interaction: ChatInputCommandInteraction) {
    try {
        if (!interaction.guildId) {
            await interaction.reply({
                content: "This command can only be used in a server.",
                ephemeral: true,
            });
            return;
        }

        const channel = interaction.options.getChannel("channel", true);
        const guildId = BigInt(interaction.guildId);

        // Update guild settings
        const currentSettings = await storage.getGuildSettings(guildId);

        await storage.upsertGuildSettings({
            guildId,
            qotdChannelId: BigInt(channel.id),
            qotdEnabled: true,
            configuredBy: BigInt(interaction.user.id),
            ...(currentSettings || {}),
        });

        const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle("QOTD Enabled")
            .setDescription(
                `Quote of the Day will be posted daily in ${channel.toString()}.\n\n` +
                `The first quote will be posted within 24 hours.`
            )
            .setFooter({ text: "Powered by ZenQuotes API" })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error("Failed to handle /qotd command:", error);
        await interaction.reply({
            content: "Failed to configure QOTD. Please try again.",
            ephemeral: true,
        });
    }
}