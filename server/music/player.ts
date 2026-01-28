import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnection,
  StreamType,
} from "@discordjs/voice";
import { spawn } from "child_process";
import { TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Message } from "discord.js";
import { Track, removeFirstTrack, getQueue, clearQueue, isQueueEmpty } from "./queue";
import { logError, logInfo, logWarn } from "../logger";

const activeProcesses = new Map<string, { yt: any; ffmpeg: any }>();
const connections = new Map<string, VoiceConnection>();
const players = new Map<string, ReturnType<typeof createAudioPlayer>>();
const playerStates = new Map<string, { channelId: string; lastMessageId?: string; client: any }>();

export function getConnection(guildId: string) {
  return connections.get(guildId);
}

export function setPlayerState(guildId: string, channel: TextChannel) {
  playerStates.set(guildId, {
    channelId: channel.id,
    client: channel.client,
    lastMessageId: playerStates.get(guildId)?.lastMessageId
  });
}

function cleanupProcesses(guildId: string) {
  const proc = activeProcesses.get(guildId);
  if (!proc) return;

  try {
    if (!proc.yt.killed) proc.yt.kill("SIGKILL");
    if (!proc.ffmpeg.killed) proc.ffmpeg.kill("SIGKILL");
  } catch (e) {
    logError(`Failed to kill processes for ${guildId}`, e);
  }

  activeProcesses.delete(guildId);
  logInfo(`Cleaned up ffmpeg/yt-dlp for guild ${guildId}`);
}

/* ---------------- JOIN ---------------- */
export function joinChannel(
  guildId: string,
  channelId: string,
  adapterCreator: any,
) {
  let connection = connections.get(guildId);
  if (connection) return connection;

  connection = joinVoiceChannel({
    guildId,
    channelId,
    adapterCreator,
    selfDeaf: false,
  });

  connections.set(guildId, connection);

  connection.on("stateChange", (_, newState) => {
    logInfo(`VOICE STATE (${guildId}): ${newState.status}`);
  });

  return connection;
}

/* ---------------- PLAY NEXT HELPER ---------------- */
export async function processQueue(guildId: string) {
  cleanupProcesses(guildId);

  const nextTrack = removeFirstTrack(guildId);

  if (nextTrack) {
    await playTrack(guildId, nextTrack);
  } else {
    logInfo(`Queue finished for guild ${guildId}`);
    const state = playerStates.get(guildId);
    if (state) {
      try {
        const channel = await state.client.channels.fetch(state.channelId) as TextChannel;
        if (channel) {
          // Cleanup last message if exists
          if (state.lastMessageId) {
            try {
              const lastMsg = await channel.messages.fetch(state.lastMessageId);
              if (lastMsg) await lastMsg.delete();
            } catch { }
          }
          await channel.send("✅ **Queue finished.**");
        }
      } catch (e) { logWarn(`Failed to send queue finished msg: ${e}`); }
    }
  }
}

export function isPlaying(guildId: string): boolean {
  const player = players.get(guildId);
  return player?.state.status === AudioPlayerStatus.Playing;
}


/* ---------------- PLAY ---------------- */
export async function playTrack(guildId: string, track: Track): Promise<void> {
  const connection = connections.get(guildId);
  if (!connection) return;

  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer();
    players.set(guildId, player);

    player.on(AudioPlayerStatus.Idle, () => {
      logInfo(`Player Idle for ${guildId}, playing next...`);
      processQueue(guildId);
    });

    player.on("error", (err) => {
      logError("Audio player error", err);
      processQueue(guildId); // Try next on error
    });

    connection.subscribe(player);
  }

  logInfo(`Starting yt-dlp → ffmpeg (pcm) for: ${track.title}`);

  const yt = spawn("yt-dlp", [
    "-f", "bestaudio",
    "-4",
    "--cookies", "cookies.txt",
    // Needed for new YouTube JS complications:
    "--remote-components", "ejs:github",
    "--js-runtimes", "node",
    "--no-playlist",
    "--quiet",
    "-o", "-",
    track.url,
  ]);


  const ffmpeg = spawn("ffmpeg", [
    "-loglevel", "error",
    "-i", "pipe:0",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ]);

  activeProcesses.set(guildId, { yt, ffmpeg });

  yt.stdout.pipe(ffmpeg.stdin);

  yt.stderr.on("data", d => {
    const msg = d.toString();
    if (
      msg.includes("SABR") ||
      msg.includes("Some web client https formats") ||
      msg.includes("JavaScript runtime")
    ) return; // Ignore harmless warnings

    logWarn(`yt-dlp: ${msg.trim()}`);
  });


  ffmpeg.stderr.on("data", d => logWarn(`ffmpeg: ${d}`));

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
  });

  player.play(resource);
  logInfo(`Now playing: ${track.title}`);

  // --- MESSAGE UX ---
  const state = playerStates.get(guildId);
  if (state) {
    try {
      const channel = await state.client.channels.fetch(state.channelId) as TextChannel;
      if (channel) {
        // Delete old message
        if (state.lastMessageId) {
          try {
            const oldMsg = await channel.messages.fetch(state.lastMessageId);
            if (oldMsg) await oldMsg.delete();
          } catch (e) { /* ignore if already deleted */ }
        }

        // Send new message
        const embed = new EmbedBuilder()
          .setTitle("🎶 Now Playing")
          .setDescription(`**${track.title}**`)
          .setColor(0x5865F2)
          .addFields(
            { name: "Duration", value: track.duration ?? "Unknown", inline: true },
            { name: "Requested by", value: track.requestedBy, inline: true },
          );

        const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("player_pause").setLabel("Pause").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("player_skip").setLabel("Skip").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("player_stop").setLabel("End Session").setStyle(ButtonStyle.Danger),
        );

        const newMsg = await channel.send({ embeds: [embed], components: [controls] });
        state.lastMessageId = newMsg.id;
        playerStates.set(guildId, state);
      }
    } catch (err) {
      logWarn(`Failed to send Now Playing message: ${err}`);
    }
  }
}



/* ---------------- PAUSE ---------------- */
export function togglePause(guildId: string) {
  const player = players.get(guildId);
  if (!player) return;

  if (player.state.status === AudioPlayerStatus.Playing) {
    player.pause();
  } else {
    player.unpause();
  }
}

/* ---------------- STOP ---------------- */
export function stopPlayback(guildId: string) {
  cleanupProcesses(guildId);
  const player = players.get(guildId);
  if (player) {
    player.stop(); // This triggers Idle, which triggers playNext.
    // Wait. If stop() triggers Idle, playNext will run.
    // If we want to FULLY STOP, we need to clear the queue first?
    // Or playNext checks queue.
    // If we want to SKIP, we just stop(). playNext takes next.
    // If we want to STOP_SESSION, we should clear queue first.
  }
}

/* ---------------- DESTROY ---------------- */
export function destroyConnection(guildId: string) {
  cleanupProcesses(guildId);
  const player = players.get(guildId);
  if (player) {
    player.stop();
    players.delete(guildId);
  }

  const connection = connections.get(guildId);
  if (connection) {
    connection.destroy();
    connections.delete(guildId);
  }

  playerStates.delete(guildId);

  logInfo(`Destroyed voice session for guild ${guildId}`);
}
