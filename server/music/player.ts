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

type PlayerState = {
  channelId: string;
  lastMessageId?: string;
  client: any;
  currentTrack?: Track; // Store the currently playing track
};

const playerStates = new Map<string, PlayerState>();

export function getConnection(guildId: string) {
  return connections.get(guildId);
}

export function setPlayerState(guildId: string, channel: any) {
  playerStates.set(guildId, {
    channelId: channel.id,
    client: channel.client,
    lastMessageId: playerStates.get(guildId)?.lastMessageId
  });
}

// Lock state management
const guildLocks = new Map<string, boolean>();

export function lockPlayer(guildId: string) {
  guildLocks.set(guildId, true);
}

export function unlockPlayer(guildId: string) {
  guildLocks.set(guildId, false);
}

export function isPlayerLocked(guildId: string): boolean {
  return guildLocks.get(guildId) ?? false;
}

// Pause state tracking
const pauseStates = new Map<string, boolean>();

export function setPauseState(guildId: string, isPaused: boolean) {
  pauseStates.set(guildId, isPaused);
}

export function isPaused(guildId: string): boolean {
  return pauseStates.get(guildId) ?? false;
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
          // Fetch play command ID for clickable link
          const playCmd = state.client.application?.commands.cache.find((c: any) => c.name === "play");
          const playMention = playCmd ? `</play:${playCmd.id}>` : "`/play`";

          const finishPayload: any = {
            content: "",
            flags: 32768, // IS_COMPONENTS_V2
            components: [
              {
                type: 17, // CONTAINER
                components: [
                  {
                    type: 10,
                    content: `### Queue Finished\nAll tracks have been played. Use ${playMention} to queue more songs!`
                  }
                ]
              }
            ]
          };
          await channel.send(finishPayload);
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

  // Reset pause state for new track
  setPauseState(guildId, false);

  // Store current track in player state
  const pState = playerStates.get(guildId);
  if (pState) {
    pState.currentTrack = track;
    playerStates.set(guildId, pState);
  }

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

  // PREVENT CRASH: Handle EPIPE / ECONNRESET if ffmpeg dies early
  yt.stdout.on('error', (err) => {
    if ((err as any).code === 'EPIPE' || (err as any).code === 'ECONNRESET') return;
    logWarn(`yt-dlp stdout error: ${err}`);
  });
  ffmpeg.stdin.on('error', (err) => {
    if ((err as any).code === 'EPIPE' || (err as any).code === 'ECONNRESET') return;
    logWarn(`ffmpeg stdin error: ${err}`);
  });

  yt.stderr.on("data", d => {
    const msg = d.toString();
    if (
      msg.includes("SABR") ||
      msg.includes("Some web client https formats") ||
      msg.includes("JavaScript runtime")
    ) return; // Ignore harmless warnings

    logWarn(`yt-dlp: ${msg.trim()}`);
  });


  ffmpeg.stderr.on("data", d => {
    const msg = d.toString();
    // Ignore errors that happen when we kill the process intentionally
    if (msg.includes("Invalid argument") || msg.includes("pipe:0") || msg.includes("Invalid data")) return;
    logWarn(`ffmpeg: ${msg}`);
  });

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
  });

  player.play(resource);
  logInfo(`Now playing: ${track.title}`);

  // --- MESSAGE UX ---
  const state = playerStates.get(guildId);
  if (state) {
    try {
      const channel = await state.client.channels.fetch(state.channelId) as any;
      if (channel) {
        // Delete old message
        if (state.lastMessageId) {
          try {
            const oldMsg = await channel.messages.fetch(state.lastMessageId);
            if (oldMsg) await oldMsg.delete();
          } catch (e) { /* ignore if already deleted */ }
        }

        // --- MESSAGE UX (Components v2 Raw Payload) ---
        // Construction of the "One Giant Container" using Discord's new API types (v2).
        // Container (17) -> [ Text (10), ActionRow (1) ]

        const rawButtons = [
          new ButtonBuilder()
            .setCustomId("player_pause")
            .setLabel(isPaused(guildId) ? "▶ Resume" : "❚❚ Pause")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("player_skip").setLabel("⏭ Skip").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("player_stop").setLabel("⏹ End Session").setStyle(ButtonStyle.Danger),
        ].map(b => b.toJSON());

        const payload: any = {
          content: "",
          flags: 32768, // IS_COMPONENTS_V2 (1 << 15)
          components: [
            {
              type: 17, // CONTAINER
              // accent_color removed to eliminate border
              components: [
                {
                  type: 10, // TEXT_DISPLAY
                  content: `### 🎶 Now Playing\n**[${track.title}](${track.url})**\n\n**Duration:** ${track.duration ?? "N/A"}\n**Req:** ${track.requestedBy}${isPlayerLocked(guildId) ? "\n**Player Locked** (Admins only)" : ""}\n\n*fck Musico*`
                },
                {
                  type: 14, // SEPARATOR
                  spacing: 1 // small
                },
                {
                  type: 1, // ACTION_ROW
                  components: rawButtons
                }
              ]
            }
          ]
        };

        // Note: We bypass discord.js type checking by casting the payload options
        const newMsg = await channel.send(payload);
        state.lastMessageId = newMsg.id;
        playerStates.set(guildId, state);
      }
    } catch (err) {
      logWarn(`Failed to send Now Playing message: ${err}`);
    }
  }
} // End playTrack



/* ---------------- PAUSE ---------------- */
export async function togglePause(guildId: string) {
  const player = players.get(guildId);
  if (!player) return;

  if (player.state.status === AudioPlayerStatus.Playing) {
    player.pause();
    setPauseState(guildId, true);
  } else {
    player.unpause();
    setPauseState(guildId, false);
  }

  // Update the player UI to reflect new state
  console.log(`Calling updatePlayerUI for ${guildId}`);
  await updatePlayerUI(guildId);
}

// Helper to update player UI without changing the track
export async function updatePlayerUI(guildId: string) {
  const state = playerStates.get(guildId);
  if (!state || !state.lastMessageId) {
    return;
  }

  try {
    const channel = await state.client.channels.fetch(state.channelId) as TextChannel;
    if (!channel) {
      return;
    }

    const message = await channel.messages.fetch(state.lastMessageId);
    if (!message) {
      return;
    }

    // Get current track from player state (not queue, since it's already been removed)
    const track = state.currentTrack;
    if (!track) {
      return;
    }

    const paused = isPaused(guildId);
    console.log(`Updating UI - Paused: ${paused}, Locked: ${isPlayerLocked(guildId)}`);

    const rawButtons = [
      new ButtonBuilder()
        .setCustomId("player_pause")
        .setLabel(paused ? "▶ Resume" : "❚❚ Pause")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("player_skip").setLabel("⏭ Skip").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("player_stop").setLabel("⏹ End Session").setStyle(ButtonStyle.Danger),
    ].map(b => b.toJSON());

    const payload: any = {
      content: "",
      flags: 32768,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `### 🎶 Now Playing\n**[${track.title}](${track.url})**\n\n**Duration:** ${track.duration ?? "N/A"}\n**Req:** ${track.requestedBy}${isPlayerLocked(guildId) ? "\n**Player Locked** (Admins only)" : ""}\n\n*fck Musico*`
            },
            {
              type: 14,
              spacing: 1
            },
            {
              type: 1,
              components: rawButtons
            }
          ]
        }
      ]
    };

    await message.edit(payload);
  } catch (err) {
    logWarn(`Failed to update player UI: ${err}`);
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
