import { ChatInputCommandInteraction, GuildMember } from "discord.js";
import play from "play-dl";
import { addTrack, getQueue, clearQueue, isQueueEmpty, Track } from "./queue";
import { joinChannel, playTrack, stopPlayback, destroyConnection, getConnection } from "./player";
import { logInfo } from "../logger";

// Safety guards
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

export async function handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!checkVoiceChannel(interaction) || !checkBotPermissions(interaction)) return;

  const query = interaction.options.getString("query", true);
  const guildId = interaction.guild!.id;
  const voiceChannel = (interaction.member as GuildMember).voice.channel!;

  await interaction.deferReply();

  try {
    // Check if bot is already connected to a different channel
    const existingConnection = getConnection(guildId);
    if (existingConnection && existingConnection.joinConfig.channelId !== voiceChannel.id) {
      await interaction.editReply("I'm already connected to a different voice channel.");
      return;
    }

    // Join channel if not connected
    if (!existingConnection) {
      await joinChannel(guildId, voiceChannel.id, interaction.guild!.voiceAdapterCreator);
    }

    // Search for track
    const searchResult = await play.search(query, { limit: 1 });
    if (!searchResult || searchResult.length === 0) {
      await interaction.editReply("No results found for that query.");
      return;
    }

    const track: Track = {
      title: searchResult[0].title || "Unknown",
      url: searchResult[0].url,
      requestedBy: interaction.user.username,
    };

    addTrack(guildId, track);

    logInfo(`Added track: ${track.title} to queue for guild ${guildId}`);

    // If queue was empty, start playing
    if (getQueue(guildId).length === 1) {
      await playTrack(guildId, track);
      await interaction.editReply(`Now playing: **${track.title}**`);
    } else {
      await interaction.editReply(`Added to queue: **${track.title}**`);
    }
  } catch (error) {
    console.error("Play command error:", error);
    await interaction.editReply("Failed to play the requested track.");
  }
}

export async function handleSkip(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!checkVoiceChannel(interaction)) return;

  const guildId = interaction.guild!.id;

  if (isQueueEmpty(guildId)) {
    await interaction.reply({
      content: "There's nothing playing to skip.",
      ephemeral: true,
    });
    return;
  }

  stopPlayback(guildId);

  // The player will auto-play the next track
  const nextTrack = getQueue(guildId)[0];
  if (nextTrack) {
    await playTrack(guildId, nextTrack);
    await interaction.reply(`Skipped! Now playing: **${nextTrack.title}**`);
  } else {
    await interaction.reply("Skipped! Queue is now empty.");
  }
}

export async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!checkVoiceChannel(interaction)) return;

  const guildId = interaction.guild!.id;

  clearQueue(guildId);
  destroyConnection(guildId);

  await interaction.reply("Stopped playing music and cleared the queue.");
}

export async function handleQueue(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const queue = getQueue(guildId);

  if (queue.length === 0) {
    await interaction.reply({
      content: "The queue is empty.",
      ephemeral: true,
    });
    return;
  }

  const queueList = queue.slice(0, 10).map((track, index) =>
    `${index + 1}. **${track.title}** - Requested by ${track.requestedBy}`
  ).join("\n");

  const content = `**Current Queue:**\n${queueList}${
    queue.length > 10 ? `\n...and ${queue.length - 10} more tracks.` : ""
  }`;

  await interaction.reply({
    content,
    ephemeral: true,
  });
}
