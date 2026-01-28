import { ChatInputCommandInteraction, GuildMember, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { VoiceConnectionStatus } from "@discordjs/voice";
import {
  addTrack,
  getQueue,
  clearQueue,
  isQueueEmpty,
  Track,
} from "./queue";
import {
  joinChannel,
  playTrack,
  stopPlayback,
  destroyConnection,
  getConnection,
  setPlayerState,
  processQueue,
  isPlaying,
} from "./player";
import { logInfo, logError } from "../logger";

const exec = promisify(execFile);

/* SAFETY CHECKS */

function checkVoiceChannel(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as GuildMember;
  if (!member.voice.channel) {
    interaction.reply({
      content: "You must be in a voice channel to use this command.",
      ephemeral: true,
    });
    return false;
  }
  return true;
}

function checkBotPermissions(interaction: ChatInputCommandInteraction): boolean {
  const guild = interaction.guild;
  if (!guild) return false;

  const botMember = guild.members.me;
  if (!botMember) return false;

  const voiceChannel = (interaction.member as GuildMember).voice.channel;
  if (!voiceChannel) return false;

  const permissions = voiceChannel.permissionsFor(botMember);
  if (!permissions?.has(["Connect", "Speak"])) {
    interaction.reply({
      content: "I don't have permission to connect or speak in your voice channel.",
      ephemeral: true,
    });
    return false;
  }
  return true;
}

/* YT SEARCH  */

async function searchYouTube(
  query: string,
): Promise<{ title: string; url: string; duration?: string } | null> {
  try {
    const { stdout } = await exec("yt-dlp", [
      `ytsearch1:${query}`,
      "-4",
      "--cookies", "cookies.txt",
      "--remote-components", "ejs:github",
      "--print",
      "%(title)s|%(webpage_url)s|%(duration_string)s",
      "--no-playlist",
      "--quiet",
    ]);

    const line = stdout.trim();
    if (!line) return null;

    // split safely from the RIGHT
    const parts = line.split("|");
    if (parts.length < 3) {
      logError("yt-dlp malformed output", { stdout });
      return null;
    }

    const duration = parts.pop()?.trim();
    const url = parts.pop()?.trim();
    const title = parts.join("|").trim(); // rejoin title safely

    if (!url || !url.startsWith("http")) {
      logError("yt-dlp returned non-URL", { title, url, duration });
      return null;
    }

    return { title, url, duration };
  } catch (err) {
    logError("yt-dlp search failed", err);
    return null;
  }
}


/* COMMANDS */

export async function handlePlay(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!checkVoiceChannel(interaction) || !checkBotPermissions(interaction)) return;

  const query = interaction.options.getString("query", true);
  const guildId = interaction.guild!.id;
  const voiceChannel = (interaction.member as GuildMember).voice.channel!;

  await interaction.deferReply();

  try {
    const existingConnection = getConnection(guildId);
    if (
      existingConnection &&
      existingConnection.joinConfig.channelId !== voiceChannel.id
    ) {
      await interaction.editReply(
        "I'm already connected to another voice channel.",
      );
      return;
    }

    if (!existingConnection) {
      await joinChannel(
        guildId,
        voiceChannel.id,
        interaction.guild!.voiceAdapterCreator,
      );
    }

    // Register channel for updates
    if (interaction.channel instanceof TextChannel) {
      setPlayerState(guildId, interaction.channel);
    }

    const result = await searchYouTube(query);
    if (!result) {
      await interaction.editReply("No results found.");
      return;
    }

    /* HARD GUARD  */
    if (!result.url || !result.url.startsWith("http")) {
      logError("Blocked non-URL result from yt-dlp", result);
      await interaction.editReply("Failed to resolve a playable YouTube link.");
      return;
    }

    const track: Track = {
      title: result.title,
      url: result.url,
      duration: result.duration,
      requestedBy: interaction.user.username,
    };


    addTrack(guildId, track);
    logInfo(`Queued: ${track.title} (${guildId})`);

    // If not playing, kickstart
    if (!isPlaying(guildId)) {
      await processQueue(guildId);
      // The processQueue will send the "Now Playing" message
      // We just reply to the command
      await interaction.editReply(`🔎 **Found:** ${track.title}`);
    } else {
      await interaction.editReply(`➕ **Added to queue:** ${track.title}`);
    }

  } catch (err) {
    logError("Play command failed", err);
    await interaction.editReply("Failed to play the track.");
  }
}

export async function handleSkip(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!checkVoiceChannel(interaction)) return;

  const guildId = interaction.guild!.id;

  // We rely on player state now
  // If we stop playback, idle listener handles next song

  stopPlayback(guildId);

  await interaction.reply("⏭ **Skipped!**");
}


export async function handleStop(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!checkVoiceChannel(interaction)) return;

  const guildId = interaction.guild!.id;
  clearQueue(guildId);
  destroyConnection(guildId);

  await interaction.reply("⏹ **Stopped and cleared the queue.**");
}

export async function handleQueue(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guild!.id;
  const queue = getQueue(guildId);

  if (queue.length === 0) {
    await interaction.reply({
      content: "Queue is empty.",
      ephemeral: true,
    });
    return;
  }

  const list = queue
    .slice(0, 10)
    .map(
      (t, i) => `${i + 1}. **${t.title}** (by ${t.requestedBy})`,
    )
    .join("\n");

  await interaction.reply({
    content: `🎶 **Queue:**\n${list}${queue.length > 10 ? `\n…and ${queue.length - 10} more` : ""
      }`,
    ephemeral: true,
  });
}
