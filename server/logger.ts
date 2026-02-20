import { TextChannel } from "discord.js";
import { client } from "./bot";
import { storage } from "./storage";

let lastSent = 0;

// Cache resolved log channels per guild to avoid repeated DB lookups
const logChannelCache = new Map<string, TextChannel | null>();
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // Refresh every 60 seconds

async function getLogChannels(): Promise<TextChannel[]> {
  const now = Date.now();
  if (now < cacheExpiry && logChannelCache.size > 0) {
    return Array.from(logChannelCache.values()).filter((c): c is TextChannel => c !== null);
  }

  logChannelCache.clear();

  try {
    const guilds = await storage.getAllConfiguredGuilds();
    for (const settings of guilds) {
      if (settings.logChannelId) {
        const guild = client.guilds.cache.get(settings.guildId.toString());
        if (guild) {
          const channel = guild.channels.cache.get(settings.logChannelId.toString()) as TextChannel | undefined;
          logChannelCache.set(settings.guildId.toString(), channel ?? null);
        }
      }
    }
  } catch {
    // DB not ready yet or failed — silently skip
  }

  cacheExpiry = now + CACHE_TTL_MS;
  return Array.from(logChannelCache.values()).filter((c): c is TextChannel => c !== null);
}

async function send(content: string) {
  if (!client.isReady()) return;

  const now = Date.now();
  if (now - lastSent < 3000) return; // rate limit protection
  lastSent = now;

  const channels = await getLogChannels();
  if (channels.length === 0) return;

  const truncated = content.slice(0, 2000);
  for (const channel of channels) {
    await channel.send(truncated).catch(() => { });
  }
}

// exposed helpers
export async function logError(title: string, err?: unknown) {
  console.error(title, err);
  await send(
    `🚨 **${title}**\n\`\`\`${String(err ?? "No details").slice(0, 1800)}\`\`\``
  );
}

export async function logWarn(message: string) {
  console.warn(message);
  await send(`***Warning***\n${message}`);
}

export async function logInfo(message: string) {
  console.log(message);
}
