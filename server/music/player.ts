import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnection,
  StreamType,
} from "@discordjs/voice";
import { spawn } from "child_process";
import { Track, removeFirstTrack } from "./queue";
import { logError, logInfo, logWarn } from "../logger";

const activeProcesses = new Map<string, { yt: any; ffmpeg: any }>();
const connections = new Map<string, VoiceConnection>();
const players = new Map<string, ReturnType<typeof createAudioPlayer>>();

export function getConnection(guildId: string) {
  return connections.get(guildId);
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
    selfDeaf: false, // important for debugging
  });

  connections.set(guildId, connection);

  connection.on("stateChange", (_, newState) => {
    logInfo(`VOICE STATE (${guildId}): ${newState.status}`);
  });

  return connection;
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
      const next = removeFirstTrack(guildId);
      if (next) playTrack(guildId, next);
      else logInfo(`Queue finished for guild ${guildId}`);
    });

    player.on("error", (err) => {
      logError("Audio player error", err);
    });

    connection.subscribe(player);
  }

  logInfo(`Starting yt-dlp → ffmpeg (pcm) for: ${track.title}`);

  const yt = spawn("yt-dlp", [
  "-f", "bestaudio",
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

  yt.stdout.pipe(ffmpeg.stdin);

 yt.stderr.on("data", d => {
  const msg = d.toString();
  if (
    msg.includes("SABR") ||
    msg.includes("Some web client https formats") ||
    msg.includes("JavaScript runtime")
  ) return;

  logWarn(`yt-dlp: ${msg.trim()}`);
});


  ffmpeg.stderr.on("data", d => logWarn(`ffmpeg: ${d}`));

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
  });

  player.play(resource);
  logInfo(`Now playing: ${track.title}`);
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
  const player = players.get(guildId);
  if (player) player.stop();
}

/* ---------------- DESTROY ---------------- */
export function destroyConnection(guildId: string) {
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

  logInfo(`Destroyed voice session for guild ${guildId}`);
}
