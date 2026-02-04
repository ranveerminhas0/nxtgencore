import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnection,
  StreamType,
  NoSubscriberBehavior,
  generateDependencyReport,
} from "@discordjs/voice";
// Log dependencies for debugging
// console.log(generateDependencyReport());
import { Readable } from "stream";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Message, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { Track, removeFirstTrack, getQueue, clearQueue, isQueueEmpty } from "./queue";
import { logError, logInfo, logWarn } from "../logger";

const exec = promisify(execFile);

// Cache for suggestions to avoid re-fetching on UI updates
export const suggestionsCache = new Map<string, { title: string; url: string; duration?: string }[]>();

async function getSuggestions(videoUrl: string, guildId: string): Promise<{ title: string; url: string; duration?: string }[]> {
  // Return cached if available
  if (suggestionsCache.has(guildId)) {
    return suggestionsCache.get(guildId)!;
  }

  try {
    // Extract video ID from URL
    const videoIdMatch = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!videoIdMatch) {
      logWarn("Could not extract video ID for suggestions");
      return [];
    }
    const videoId = videoIdMatch[1];

    // Use YouTube Mix playlist (RD{videoId}) - these are auto-generated similar songs
    const mixUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;

    const { stdout } = await exec("yt-dlp", [
      mixUrl,
      "-4",
      "--cookies", "cookies.txt",
      "--remote-components", "ejs:github",
      "--flat-playlist",
      "--print", "%(title)s|%(url)s|%(duration_string)s",
      "--playlist-start", "2",  // Skip first (current song)
      "--playlist-end", "11",   // Get next 10
      "--quiet"
    ]);

    const results = stdout.trim().split("\n").filter(Boolean).map(line => {
      const parts = line.split("|");
      const duration = parts.pop()?.trim();
      const url = parts.pop()?.trim();
      const title = parts.join("|").trim();
      return { title, url: url || "", duration };
    }).filter(s => s.url && s.url.includes("youtube"));

    suggestionsCache.set(guildId, results);
    return results;
  } catch (err) {
    logError("Failed to fetch suggestions", err);
    return [];
  }
}

const activeProcesses = new Map<string, { yt: any }>();
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
  } catch (e) {
    logError(`Failed to kill processes for ${guildId}`, e);
  }

  activeProcesses.delete(guildId);
  logInfo(`Cleaned up yt-dlp for guild ${guildId}`);
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
    selfDeaf: true, // SAVE BANDWIDTH: Don't receive audio
  });

  connections.set(guildId, connection);

  connection.on("stateChange", (_, newState) => {
    logInfo(`VOICE STATE (${guildId}): ${newState.status}`);
  });

  // UDP SOCKET WARM-UP: Play 200ms of silence
  // This helps "punch" the UDP hole before the heavy music stream starts
  const silence = createAudioResource(Readable.from([Buffer.alloc(3840, 0)]), {
    inputType: StreamType.Raw
  });

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play,
    },
  });

  player.play(silence);
  connection.subscribe(player);

  // Clean up this temp player after 500ms
  setTimeout(() => {
    player.stop();
  }, 500);

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
    player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });
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

  logInfo(`Starting yt-dlp → ffmpeg (opus) for: ${track.title}`);

  // Reset pause state for new track
  setPauseState(guildId, false);

  // Store current track in player state
  const pState = playerStates.get(guildId);
  if (pState) {
    pState.currentTrack = track;
    playerStates.set(guildId, pState);
  }

  // Add to history (fire and forget)
  import("./history").then(({ addToHistory }) => addToHistory(guildId, track));


  // Clear old suggestions cache for new track
  suggestionsCache.delete(guildId);

  // Cleanup previous processes to prevent zombies/glitches
  cleanupProcesses(guildId);

  // Fallback Strategy (Option B) - Let Discord.js handle decoding
  const yt = spawn("yt-dlp", [
    "-f", "bestaudio",             // Standard format
    "--no-playlist",
    "--quiet",
    "--force-ipv4",                // Keep stability
    "--cookies", "cookies.txt",    // Keep access
    "--remote-components", "ejs:github",
    "--js-runtimes", "node",
    "-o", "-",                     // Stream to stdout
    track.url,
  ]);

  activeProcesses.set(guildId, { yt });

  // Handle errors
  yt.stdout.on('error', (err) => {
    if ((err as any).code === 'EPIPE' || (err as any).code === 'ECONNRESET') return;
    logWarn(`yt-dlp stdout error: ${err}`);
  });

  yt.stderr.on("data", d => {
    const msg = d.toString();
    if (
      msg.includes("SABR") ||
      msg.includes("https") ||
      msg.includes("JavaScript")
    ) return;

    logWarn(`yt-dlp: ${msg.trim()}`);
  });

  // Let Discord.js probe the stream type (Arbitrary)
  const resource = createAudioResource(yt.stdout, {
    inputType: StreamType.Arbitrary,
    inlineVolume: false
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
        // Container (17) -> [ Text, Separator, SelectMenu, Separator, Buttons ]

        // Fetch suggestions in background (don't block playback)
        const suggestions = await getSuggestions(track.url, guildId);

        const rawButtons = [
          new ButtonBuilder()
            .setCustomId("player_pause")
            .setLabel(isPaused(guildId) ? "▶ Resume" : "❚❚ Pause")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("player_skip").setLabel("⏭ Skip").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("player_stop").setLabel("⏹ End Session").setStyle(ButtonStyle.Danger),
        ].map(b => b.toJSON());

        // Build suggestions select menu (use index as value, lookup from cache in handler)
        const suggestionOptions = suggestions.slice(0, 10).map((s, i) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${i + 1}. ${s.title.substring(0, 90)}`)
            .setDescription(`Duration: ${s.duration || "N/A"}`)
            .setValue(`${guildId}:${i}`) // guildId:index format for lookup
        );

        const selectMenu = suggestionOptions.length > 0
          ? new StringSelectMenuBuilder()
            .setCustomId("player_suggestion")
            .setPlaceholder("🎵 Add similar songs to queue...")
            .addOptions(suggestionOptions)
            .toJSON()
          : null;

        const containerComponents: any[] = [
          {
            type: 10, // TEXT_DISPLAY
            content: `### 🎶 Now Playing\n**[${track.title}](${track.url})**\n\n**Duration:** ${track.duration ?? "N/A"}\n**Req:** ${track.requestedBy}${isPlayerLocked(guildId) ? "\n**Player Locked** (Admins only)" : ""}\n\n*Nxt Gen Music*`
          },
          { type: 14, spacing: 1 } // SEPARATOR
        ];

        // Add suggestions dropdown if available
        if (selectMenu) {
          containerComponents.push({ type: 1, components: [selectMenu] }); // ACTION_ROW with SelectMenu
          containerComponents.push({ type: 14, spacing: 1 }); // SEPARATOR
        }

        containerComponents.push({ type: 1, components: rawButtons }); // Buttons row

        const payload: any = {
          content: "",
          flags: 32768, // IS_COMPONENTS_V2
          components: [
            {
              type: 17, // CONTAINER
              components: containerComponents
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
export async function togglePause(guildId: string, interaction?: any) {
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
  await updatePlayerUI(guildId, interaction);
}

// Helper to update player UI without changing the track
export async function updatePlayerUI(guildId: string, interaction?: any) {
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

    // Get cached suggestions
    const suggestions = suggestionsCache.get(guildId) || [];

    const suggestionOptions = suggestions.slice(0, 10).map((s, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${i + 1}. ${s.title.substring(0, 90)}`)
        .setDescription(`Duration: ${s.duration || "N/A"}`)
        .setValue(`${guildId}:${i}`) // guildId:index format for lookup
    );

    const selectMenu = suggestionOptions.length > 0
      ? new StringSelectMenuBuilder()
        .setCustomId("player_suggestion")
        .setPlaceholder("🎵 Add similar songs to queue...")
        .addOptions(suggestionOptions)
        .toJSON()
      : null;

    const containerComponents: any[] = [
      {
        type: 10,
        content: `### 🎶 Now Playing\n**[${track.title}](${track.url})**\n\n**Duration:** ${track.duration ?? "N/A"}\n**Req:** ${track.requestedBy}${isPlayerLocked(guildId) ? "\n**Player Locked** (Admins only)" : ""}\n\n*Nxt Gen Music*`
      },
      { type: 14, spacing: 1 }
    ];

    if (selectMenu) {
      containerComponents.push({ type: 1, components: [selectMenu] });
      containerComponents.push({ type: 14, spacing: 1 });
    }

    containerComponents.push({ type: 1, components: rawButtons });

    const payload: any = {
      content: "",
      flags: 32768,
      components: [
        {
          type: 17,
          components: containerComponents
        }
      ]
    };

    if (interaction && (interaction.replied || interaction.deferred)) {
      await interaction.editReply(payload);
    } else if (interaction) {
      await interaction.update(payload);
    } else {
      await message.edit(payload);
    }
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
  }
}

/* ---------------- DESTROY ---------------- */
export function destroyConnection(guildId: string) {
  // 1. Kill child processes
  cleanupProcesses(guildId);

  // 2. Cleanup Connection & Subscription
  const connection = connections.get(guildId);
  if (connection) {
    const subscription = (connection.state as any).subscription;
    if (subscription) {
      subscription.unsubscribe();
    }
    connection.destroy();
    connections.delete(guildId);
  }

  // 3. Cleanup Player
  const player = players.get(guildId);
  if (player) {
    player.stop();
    player.removeAllListeners(); // Prevent zombie listeners
    players.delete(guildId);
  }

  // 4. Clear State
  playerStates.delete(guildId);
  guildLocks.delete(guildId);
  pauseStates.delete(guildId);

  logInfo(`Destroyed voice session for guild ${guildId}`);
}
