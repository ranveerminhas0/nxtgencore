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

function isAdmin(member: any): boolean {
  return member?.permissions.has("Administrator") ||
    member?.roles.cache.some((r: any) => r.name === "Admin");
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
    if (interaction.channel) {
      // Cast to any to avoid strict type checks on TextChannel vs VoiceChannel text
      setPlayerState(guildId, interaction.channel as any);
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
      // "Found & Starting" - V2 Container
      const foundPayload: any = {
        content: "",
        flags: 32768, // IS_COMPONENTS_V2
        components: [
          {
            type: 17, // CONTAINER
            components: [
              {
                type: 10, // TEXT_DISPLAY
                content: `**Found & Starting:** [${track.title}](${track.url})\n**Duration:** ${track.duration || "N/A"}`
              }
            ]
          }
        ]
      };
      await interaction.editReply(foundPayload);
    } else {
      // "Added to Queue" - V2 Container
      const queuedPayload: any = {
        content: "",
        flags: 32768, // IS_COMPONENTS_V2
        components: [
          {
            type: 17, // CONTAINER
            components: [
              {
                type: 10, // TEXT_DISPLAY
                content: `### Added to Queue\n**[${track.title}](${track.url})**\n**Duration:** ${track.duration || "N/A"} • **Req:** ${track.requestedBy}`
              }
            ]
          }
        ]
      };
      await interaction.editReply(queuedPayload);
    }

  } catch (err) {
    logError("Play command failed", err);
    await interaction.editReply("Failed to play the track.");
  }
}

// Helper function to create the unified stop session payload
async function createStopSessionPayload(client: any) {
  const playCmd = client.application?.commands.cache.find((c: any) => c.name === "play");
  const playMention = playCmd ? `</play:${playCmd.id}>` : "`/play`";

  return {
    content: "",
    flags: 32768, // IS_COMPONENTS_V2
    components: [
      {
        type: 17, // CONTAINER
        components: [
          {
            type: 10,
            content: `### Session Ended\nStopped playback and cleared the queue. The bot has also left the channel. Use ${playMention} to start a new session!`
          }
        ]
      }
    ]
  };
}

export async function handleSkip(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!checkVoiceChannel(interaction)) return;

  const guildId = interaction.guild!.id;
  const { isPlayerLocked } = await import("./player");

  // Lock check
  if (isPlayerLocked(guildId) && !isAdmin(interaction.member)) {
    await interaction.reply({
      content: "The skip command is locked by an admin.",
      ephemeral: true
    });
    return;
  }

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
  const { isPlayerLocked } = await import("./player");

  // Lock check
  if (isPlayerLocked(guildId) && !isAdmin(interaction.member)) {
    await interaction.reply({
      content: "The stop command is locked by an admin.",
      ephemeral: true
    });
    return;
  }

  clearQueue(guildId);
  destroyConnection(guildId);

  // Fetch play command ID for clickable link
  const playCmd = interaction.client.application?.commands.cache.find((c: any) => c.name === "play");
  const playMention = playCmd ? `</play:${playCmd.id}>` : "`/play`";

  // V2 Container for Stop Command
  const stopPayload: any = {
    content: "",
    flags: 32768, // IS_COMPONENTS_V2
    components: [
      {
        type: 17, // CONTAINER
        components: [
          {
            type: 10,
            content: `### Session Ended\nStopped playback and cleared the queue. The bot has also left the channel. Use ${playMention} to start a new session!`
          }
        ]
      }
    ]
  };
  await interaction.reply(stopPayload);
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

export async function handleButtonInteraction(interaction: any) {
  const guildId = interaction.guildId!;
  const { isPlayerLocked } = await import("./player");

  // Lock check for all buttons
  if (isPlayerLocked(guildId) && !isAdmin(interaction.member)) {
    await interaction.reply({
      content: "Player controls are locked by an admin.",
      ephemeral: true
    });
    return;
  }

  if (interaction.customId === "player_pause") {
    const { togglePause } = await import("./player");
    await interaction.deferUpdate(); // Defer first to acknowledge the interaction
    await togglePause(guildId); // This will update the UI
  }

  if (interaction.customId === "player_skip") {
    const { stopPlayback } = await import("./player");
    stopPlayback(guildId);
    await interaction.deferUpdate();
  }

  if (interaction.customId === "player_stop") {
    const { destroyConnection } = await import("./player");
    clearQueue(guildId);
    destroyConnection(guildId);

    const stopPayload = await createStopSessionPayload(interaction.client);
    await interaction.update(stopPayload);
  }
}

// Prefix command handlers for !mlock and !munlock
export async function handleLockCommand(message: any) {
  if (!isAdmin(message.member)) {
    return message.reply("Admin only.");
  }

  const { lockPlayer, updatePlayerUI } = await import("./player");
  lockPlayer(message.guild.id);
  await updatePlayerUI(message.guild.id);

  const lockPayload: any = {
    content: "",
    flags: 32768,
    components: [{
      type: 17,
      components: [{
        type: 10,
        content: "### Player Locked\nMusic player controls are now restricted to admins only.\nHow it feels now?"
      }]
    }]
  };

  await message.channel.send(lockPayload);
}

export async function handleUnlockCommand(message: any) {
  if (!isAdmin(message.member)) {
    return message.reply("Admin only.");
  }

  const { unlockPlayer, updatePlayerUI } = await import("./player");
  unlockPlayer(message.guild.id);
  await updatePlayerUI(message.guild.id);

  const unlockPayload: any = {
    content: "",
    flags: 32768,
    components: [{
      type: 17,
      components: [{
        type: 10,
        content: "### Player Unlocked\nMusic player controls can now be accessed by anyone."
      }]
    }]
  };

  await message.channel.send(unlockPayload);
}
