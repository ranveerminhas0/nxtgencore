import { ChatInputCommandInteraction, GuildMember } from "discord.js";
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
): Promise<{ title: string; url: string } | null> {
  try {
    const { stdout } = await exec("yt-dlp", [
      `ytsearch1:${query}`,
      "--print",
      "%(title)s|%(webpage_url)s",
      "--no-playlist",
      "--quiet",
    ]);

    const lines = stdout
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (!line.includes("|")) continue;

      const parts = line.split("|").map(s => s.trim());
const url = parts.pop(); // LAST PART
const title = parts.join(" | "); // REST IS TITLE

if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
  return { title, url };
}

    }

    logError("yt-dlp returned no playable URL", { stdout });
    return null;
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
  requestedBy: interaction.user.username,
};


    addTrack(guildId, track);
    logInfo(`Queued: ${track.title} (${guildId})`);

    if (getQueue(guildId).length === 1) {
      await playTrack(guildId, track);
      await interaction.editReply(`🎵 Now playing: **${track.title}**`);
    } else {
      await interaction.editReply(`➕ Added to queue: **${track.title}**`);
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

  if (isQueueEmpty(guildId)) {
    await interaction.reply({
      content: "Nothing is playing.",
      ephemeral: true,
    });
    return;
  }

  stopPlayback(guildId);

  const next = getQueue(guildId)[0];
  if (next) {
    await playTrack(guildId, next);
    await interaction.reply(`⏭ Skipped. Now playing **${next.title}**`);
  } else {
    await interaction.reply("⏭ Skipped. Queue is empty.");
  }
}

export async function handleStop(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!checkVoiceChannel(interaction)) return;

  const guildId = interaction.guild!.id;
  clearQueue(guildId);
  destroyConnection(guildId);

  await interaction.reply("⏹ Stopped and cleared the queue.");
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
    content: `🎶 **Queue:**\n${list}${
      queue.length > 10 ? `\n…and ${queue.length - 10} more` : ""
    }`,
    ephemeral: true,
  });
}
