import { TextChannel } from "discord.js";
import { client } from "./bot";

let lastSent = 0;

async function send(content: string) {
  if (!process.env.LOG_CHANNEL_ID) return;
  if (!client.isReady()) return;

  const now = Date.now();
  if (now - lastSent < 3000) return; // rate limit protection
  lastSent = now;

  const channel = client.channels.cache.get(
    process.env.LOG_CHANNEL_ID
  ) as TextChannel | undefined;

  if (!channel) return;

  await channel.send(content.slice(0, 2000));
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
