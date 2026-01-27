import {
  joinVoiceChannel,
  VoiceConnection,
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import play from "play-dl";
import { Track, getQueue, removeFirstTrack, isQueueEmpty } from "./queue";
import { logError, logInfo } from "../logger";

// Map<guildId, VoiceConnection>
const connections = new Map<string, VoiceConnection>();
// Map<guildId, AudioPlayer>
const players = new Map<string, AudioPlayer>();

export function getConnection(guildId: string): VoiceConnection | undefined {
  return connections.get(guildId);
}

export function setConnection(guildId: string, connection: VoiceConnection): void {
  connections.set(guildId, connection);
}

export function getPlayer(guildId: string): AudioPlayer | undefined {
  return players.get(guildId);
}

export function setPlayer(guildId: string, player: AudioPlayer): void {
  players.set(guildId, player);
}

export async function joinChannel(guildId: string, channelId: string, adapterCreator: any): Promise<VoiceConnection> {
  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator,
  });

  setConnection(guildId, connection);

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    logInfo(`Voice connection disconnected for guild ${guildId}`);
    destroyConnection(guildId);
  });

  return connection;
}

export async function playTrack(guildId: string, track: Track): Promise<void> {
  const connection = getConnection(guildId);
  if (!connection) return;

  try {
    const stream = await play.stream(track.url, { quality: 2 });
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
    });

    let player = getPlayer(guildId);
    if (!player) {
      player = createAudioPlayer();
      setPlayer(guildId, player);

      player.on(AudioPlayerStatus.Idle, () => {
        // Auto-play next track
        const nextTrack = removeFirstTrack(guildId);
        if (nextTrack) {
          playTrack(guildId, nextTrack);
        } else {
          // Queue empty, disconnect after a delay?
          logInfo(`Queue empty for guild ${guildId}`);
        }
      });

      player.on("error", (error) => {
        logError(`Audio player error for guild ${guildId}`, error);
        // Auto-skip on error
        const nextTrack = removeFirstTrack(guildId);
        if (nextTrack) {
          playTrack(guildId, nextTrack);
        }
      });
    }

    connection.subscribe(player);
    player.play(resource);

    logInfo(`Playing track: ${track.title} in guild ${guildId}`);
  } catch (error) {
    logError(`Failed to play track ${track.title} in guild ${guildId}`, error);
    // Auto-skip on error
    const nextTrack = removeFirstTrack(guildId);
    if (nextTrack) {
      playTrack(guildId, nextTrack);
    }
  }
}

export function stopPlayback(guildId: string): void {
  const player = getPlayer(guildId);
  if (player) {
    player.stop();
  }
}

export function destroyConnection(guildId: string): void {
  const connection = getConnection(guildId);
  if (connection) {
    connection.destroy();
    connections.delete(guildId);
  }

  const player = getPlayer(guildId);
  if (player) {
    player.stop();
    players.delete(guildId);
  }
}
