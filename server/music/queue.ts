export type Track = {
  title: string;
  url: string;
  requestedBy: string;
};

// Map<guildId, Track[]>
const queues = new Map<string, Track[]>();

export function getQueue(guildId: string): Track[] {
  return queues.get(guildId) || [];
}

export function addTrack(guildId: string, track: Track): void {
  const queue = getQueue(guildId);
  queue.push(track);
  queues.set(guildId, queue);
}

export function removeFirstTrack(guildId: string): Track | undefined {
  const queue = getQueue(guildId);
  if (queue.length === 0) return undefined;
  const track = queue.shift();
  queues.set(guildId, queue);
  return track;
}

export function clearQueue(guildId: string): void {
  queues.delete(guildId);
}

export function isQueueEmpty(guildId: string): boolean {
  return getQueue(guildId).length === 0;
}
