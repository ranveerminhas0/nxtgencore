import {
  Client,
  GatewayIntentBits,
  Partials,
  TextChannel,
  GuildMember,
  REST,
  Routes,
  SlashCommandBuilder,
  ActivityType,
  EmbedBuilder,
} from "discord.js";
import { storage } from "./storage";
import fetch from "node-fetch";
import { logInfo, logError, logWarn } from "./logger";
import { handlePlay, handleSkip, handleStop, handleQueue } from "./music/commands";

// Config
const ROLE_UNVERIFIED = "unverified";
const ROLE_NEWBIE = "NEWBIE";
const ROLE_JUNIOR = "JUNIOR";
const ROLE_INTERMEDIATE = "Intermediate";
const ROLE_ADVANCE = "Advanced";


const INTRODUCTION_CHANNEL_ID = process.env.INTRODUCTION_CHANNEL_ID!;
const GIVEAWAY_CHANNEL_ID = process.env.GIVEAWAY_CHANNEL_ID!;

const FIVE_MIN_WARN = 5 * 60 * 1000;

// In-memory timers: userId -> { fiveMin }
const timers = new Map<
  string,
  { fiveMin?: NodeJS.Timeout }
>();

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Reaction],
});

export const botStatus = {
  online: false,
  uptime: 0,
  startTime: Date.now(),
};

const commandIds = new Map<string, string>();

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) return;

  const globalCommands = [
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Tells you what the bot does"),
    new SlashCommandBuilder()
      .setName("status")
      .setDescription("Check verification and activity status")
      .addUserOption((option) =>
        option
          .setName("target")
          .setDescription("The user to check status for")
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("admhelp")
      .setDescription("Administrator commands")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("send")
          .setDescription("Send a message to a user in a specific channel")
          .addUserOption((option) =>
            option
              .setName("target")
              .setDescription("The user to mention")
              .setRequired(true),
          )
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("The channel to send the message to")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("message")
              .setDescription("The message or reason to send")
              .setRequired(true),
          ),
      ),
    new SlashCommandBuilder()
      .setName("aihelp")
      .setDescription("Ask the internal AI assistant for help")
      .addStringOption((option) =>
        option
          .setName("prompt")
          .setDescription("Your question for the AI")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("play")
      .setDescription("Play music from a URL or search query")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("The URL or search query for the music")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("skip")
      .setDescription("Skip the current playing track"),
    new SlashCommandBuilder()
      .setName("stop")
      .setDescription("Stop playing music and clear the queue"),
    new SlashCommandBuilder()
      .setName("queue")
      .setDescription("Show the current music queue"),
  ].map((command) => command.toJSON());

  const guildCommands = [
    new SlashCommandBuilder()
      .setName("scan")
      .setDescription("Scan a channel for introductions (Admin only)")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to scan for introductions")
          .setRequired(true),
      ),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    console.log("Refreshing global application commands...");

    await rest.put(Routes.applicationCommands(client.user!.id), { body: globalCommands });

    console.log("Successfully registered global commands.");

    console.log("Refreshing guild application commands...");

    await rest.put(Routes.applicationGuildCommands(client.user!.id, process.env.GUILD_ID!), { body: guildCommands });

    console.log("Successfully registered guild commands.");
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
}

async function loadCommandIds() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) return;

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    const commands = await rest.get(
      Routes.applicationCommands(client.user!.id)
    ) as any[];

    for (const cmd of commands) {
      commandIds.set(cmd.name, cmd.id);
    }

    console.log("Loaded command IDs:", Object.fromEntries(commandIds));
  } catch (error) {
    console.error("Failed to load command IDs:", error);
  }
}

export function startBot() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.warn("DISCORD_TOKEN not set. Bot will not start.");
    return;
  }

  client.login(token).catch((err) => {
    console.error("Failed to login to Discord:", err);
  });
}

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  await logWarn("Bot started successfully");

  //INITIAL READY STATE
  botStatus.online = true;
  botStatus.startTime = Date.now();

  // KEEP STATUS ACCURATE FOREVER
  setInterval(() => {
    botStatus.online = client.isReady();
  }, 10_000); // every 10 seconds

  // Set Bot Activity
  if (client.user) {
    client.user.setPresence({
      activities: [
        {
          name: "/help | Serving the community | ⚙️",
          type: ActivityType.Custom,
        },
      ],
      status: "online",
    });
  }

  // Register global commands
  await registerCommands();
  await loadCommandIds();

  // Prefetch all users and create veterans if not tracked
  const guild = client.guilds.cache.first(); // Assuming single guild
  if (guild) {
    console.log("Prefetching all guild members...");
    const members = await guild.members.fetch();
    members.forEach(async (member, id) => {
      if (member.user.bot) return;
      const existing = await storage.getUser(id);
      if (!existing) {
        await storage.createUser({
          discordId: id,
          username: member.user.tag,
          joinedAt: member.joinedAt || new Date(),
          status: "veteran",
        });
      }
    });
    console.log(`Prefetched ${members.size} members.`);
    
    await fetchAndPostGiveaways();
    // Start giveaway fetching every 1 hours
    setInterval(fetchAndPostGiveaways, 60 * 60 * 1000);
  }
});

// Slash Command Interaction Handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "help") {
    const aihelpId = commandIds.get("aihelp");
    const statusId = commandIds.get("status");
    const helpId = commandIds.get("help");

    if (!aihelpId || !statusId || !helpId) {
      await interaction.reply({
        content: "Commands are still syncing. Please try again in a moment.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `***Hey there***,\nI'm the Internal Infrastructure Bot for the Next Gen Programmers server.  \nThese commands will help you around 😊\n\n</aihelp:${aihelpId}> - Ask the internal AI assistant for help with questions\n</status:${statusId}> - Check your verification and activity status\n</help:${helpId}> - Come back here if you're Lost`,
      ephemeral: false,
    });
  }

  if (interaction.commandName === "status") {
    const targetUser =
      interaction.options.getUser("target") || interaction.user;
    const user = await storage.getUser(targetUser.id);

    if (!user) {
      await interaction.reply({
        content: `${targetUser.username} is not currently being tracked.`,
        ephemeral: false,
      });
      return;
    }

    const warnings = user.warned ? "Yes" : "None";
    const botOnlineSince = new Date(botStatus.startTime).toLocaleString();

    const introductionLine = user.introductionMessageId
      ? `Introduction: Completed - [View](https://discord.com/channels/${interaction.guild!.id}/${INTRODUCTION_CHANNEL_ID}/${user.introductionMessageId})`
      : `Introduction: Not completed`;

    const content =
      `**Status for ${targetUser.username}**:\n` +
      `Joined: ${user.joinedAt.toLocaleDateString()}\n` +
      `Warnings: ${warnings}\n` +
      `${introductionLine}\n\n` +
      `***Bot info:***\n` +
      `• Bot online since: ${botOnlineSince}\n` +
      `• Tracking: nothing right now`;

    await interaction.reply({
      content,
      ephemeral: false,
    });
  }

  if (interaction.commandName === "admhelp") {
    // Check for Administrator permission OR "Admin" role
    const hasAdminPermission =
      interaction.memberPermissions?.has("Administrator");
    const hasAdminRole = (interaction.member?.roles as any).cache.some(
      (role: any) => role.name === "Admin",
    );

    if (!hasAdminPermission && !hasAdminRole) {
      await interaction.reply({
        content:
          "You need Administrator permissions or the 'Admin' role to use this command.",
        ephemeral: true,
      });
      return;
    }

    if (interaction.options.getSubcommand() === "send") {
      const targetUser = interaction.options.getUser("target", true);
      const channel = interaction.options.getChannel("channel", true);
      const message = interaction.options.getString("message", true);

      if (channel.type !== 0 && channel.type !== 5) {
        await interaction.reply({
          content: "The selected channel must be a text channel.",
          ephemeral: true,
        });
        return;
      }

      try {
        await (channel as TextChannel).send(
          `${targetUser.toString()}, ${message}`,
        );
        await interaction.reply({
          content: `Successfully sent message to ${channel.toString()} mentioning ${targetUser.username}.`,
          ephemeral: true,
        });
      } catch (error) {
        console.error("Failed to send admhelp message:", error);
        await interaction.reply({
          content:
            "Failed to send the message. Check my permissions in that channel.",
          ephemeral: true,
        });
      }
    }
  }

  if (interaction.commandName === "scan") {
    // Check for Administrator permission OR "Admin" role
    const hasAdminPermission =
      interaction.memberPermissions?.has("Administrator");
    const hasAdminRole = (interaction.member?.roles as any).cache.some(
      (role: any) => role.name === "Admin",
    );

    if (!hasAdminPermission && !hasAdminRole) {
      await interaction.reply({
        content:
          "You need Administrator permissions or the 'Admin' role to use this command.",
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel", true);

    if (channel.type !== 0 && channel.type !== 5) {
      await interaction.reply({
        content: "The selected channel must be a text channel.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `Starting scan of ${channel.toString()}...`,
      ephemeral: false,
    });

    try {
      await interaction.editReply({
        content: `Starting scan of ${channel.toString()}...\n Messages scanned: 0`,
      });

      const messages = await fetchAllMessages(channel as TextChannel);

      await interaction.editReply({
        content: `Scanning ${channel.toString()}...\nMessages scanned: ${messages.length}\nProcessing introductions...`,
      });

      const introMap = new Map<string, string>();

      // Process messages oldest to newest to get first message per user
      for (const msg of messages.reverse()) {
  if (msg.author.bot) continue;

  // Ignore replies 
  if (msg.reference?.messageId) continue;

  if (!introMap.has(msg.author.id)) {
    introMap.set(msg.author.id, msg.id);
  }
}

      const totalUsers = introMap.size;
      let updatedCount = 0;

      await interaction.editReply({
        content: `Scanning ${channel.toString()}...\n Messages scanned: ${messages.length}\n Found ${totalUsers} introductions\n Updating database...`,
      });

      for (const [userId, messageId] of introMap) {
  const updated = await storage.updateIntroduction(userId, messageId);
  if (updated) updatedCount++;
}

      await interaction.editReply({
        content: `Scan complete! Found ${totalUsers} introductions, updated ${updatedCount} users.`,
      });
    } catch (error) {
      console.error("Scan error:", error);
      await interaction.editReply({
        content: "Failed to scan the channel. Check my permissions.",
      });
    }
  }

  // aibot
if (interaction.commandName === "aihelp") {
  const prompt = interaction.options.getString("prompt", true);

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: false });
    }
  } catch {
    return;
  }

  try {
    const aiEndpoint = process.env.AI_ENDPOINT || "http://localhost:11434";

    const res = await fetch(`${aiEndpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3:8b",
        prompt: `SYSTEM:
You are NEXT GEN CORE and u run llama3 8 billion llm model if somebody ask, a blunt, roasty developer assistant.

Rules:
- Be short, direct, and brutally honest by default.
- Keep answers under 9 words.
- IF the user explicitly asks for:
  - "tell in detail"
  - OR mentions a word count (e.g. "300 words", "long explanation")
  - OR says "explain", "deep dive", or "in detail"
THEN ignore the 30-word limit and fully explain.

Do NOT be polite.
No filler. No emojis.

User: ${prompt}`,
        stream: false,
        keep_alive: "10m",
        options: {
          num_ctx: 1024
        }
      }),
    });

    if (!res.ok) {
      throw new Error(`AI HTTP ${res.status}`);
    }

    const data: any = await res.json();
    await interaction.editReply((data.response || "No response").slice(0, 2000));
  } catch (err) {
    console.error("AI ERROR:", err);
    try {
      await interaction.editReply("AI temporarily unavailable.");
    } catch {}
  }
}
});

// 1. On Member Join
client.on("guildMemberAdd", async (member) => {
  console.log(`Member joined: ${member.user.tag}`);

  try {
    const existing = await storage.getUser(member.id);

    if (!existing) {
      await storage.createUser({
        discordId: member.id,
        username: member.user.tag,
        joinedAt: new Date(),
        status: "pending",
        warned: false,
      });
    } else {
      // Rejoin case
      await storage.updateUserOnRejoin(member.id);
    }
  } catch (err) {
    console.error("Error handling member join:", err);
  }

  // Assign Role "unverified"
  const role = member.guild.roles.cache.find((r) => r.name === ROLE_UNVERIFIED);
  if (role) {
    try {
      await member.roles.add(role);
    } catch (error) {
      console.error(`Failed to assign role to ${member.user.tag}:`, error);
    }
  }

  startTimers(member);
});

// On Member Leave
client.on("guildMemberRemove", async (member) => {
  console.log(`Member left: ${member.user.tag}`);
  await storage.markUserInactive(member.id);
});

// 2. Message Listener (Verification)
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const member = message.member;
  if (!member) return;

  // Verification logic (Introduction channel)
  if (message.channelId === INTRODUCTION_CHANNEL_ID) {
    const role = member.guild.roles.cache.find(
      (r) => r.name === ROLE_UNVERIFIED,
    );
    if (role && member.roles.cache.has(role.id)) {
      try {
        await member.roles.remove(role);
        await storage.updateUserStatus(member.id, "verified");
        const existing = timers.get(member.id);
        if (existing?.fiveMin) {
          clearTimeout(existing.fiveMin);
          timers.set(member.id, { ...existing, fiveMin: undefined });
        }
        console.log(`Verified user ${member.user.tag}`);
      } catch (error) {
        console.error(`Failed to remove role from ${member.user.tag}:`, error);
      }
    }
  }
});



function startTimers(member: GuildMember) {
  clearTimers(member.id);

  // 5 Minute Warning
  const fiveMinTimer = setTimeout(async () => {
    try {
      const fetchedMember = await member.guild.members
        .fetch(member.id)
        .catch(() => null);
      if (!fetchedMember) return;

      const role = member.guild.roles.cache.find(
        (r) => r.name === ROLE_UNVERIFIED,
      );
      if (role && fetchedMember.roles.cache.has(role.id)) {
        const channel = member.guild.channels.cache.get(
          INTRODUCTION_CHANNEL_ID,
        ) as TextChannel;
        if (channel) {
          await channel.send(
            `${member.toString()}, please send your introduction in this channel or you will be kicked.`,
          );
          await storage.updateUserStatus(member.id, "warned_5m", true);
        }
      }
    } catch (e) {
      console.error("Error in 5m timer:", e);
    }
  }, FIVE_MIN_WARN);

  timers.set(member.id, { fiveMin: fiveMinTimer });
}

function clearTimers(userId: string) {
  const existing = timers.get(userId);
  if (existing) {
    if (existing.fiveMin) clearTimeout(existing.fiveMin);
    timers.delete(userId);
  }
}

// Giveaway functions
function isSteamOrEpic(platforms: string | undefined): boolean {
  if (!platforms) return false;

  const p = platforms.toLowerCase();

  return (
    p.includes("steam") ||
    p.includes("epic")
  );
}

async function fetchGiveaways(): Promise<any[]> {
  try {
    const res = await fetch("https://www.gamerpower.com/api/giveaways");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    await logError("Giveaway fetch failed", err);
    return [];
  }
}

async function resolveFinalUrl(g: any): Promise<string | null> {
  // Steam
  if (g.platforms?.toLowerCase().includes("steam")) {
    try {
      const res = await fetch(g.open_giveaway_url);
      const html = await res.text();
      const match = html.match(
        /https:\/\/store\.steampowered\.com\/app\/\d+/
      );
      if (match) return match[0];
    } catch (err) {
      await logWarn(`URL resolution failed for giveaway ${g.id}`);
    }
  }

  // Epic (FOLLOW REDIRECTS)
  if (g.platforms?.toLowerCase().includes("epic")) {
    try {
      return await resolveEpicUrl(g.open_giveaway_url);
    } catch (err) {
      await logWarn(`URL resolution failed for giveaway ${g.id}`);
    }
  }

  return null;
}


async function resolveEpicUrl(openUrl: string): Promise<string | null> {
  try {
    const res = await fetch(openUrl, {
      redirect: "follow"
    });

    return res.url; // FINAL Epic campaign URL
  } catch {
    return null;
  }
}


async function fetchAndPostGiveaways() {
  console.log("Giveaway cron tick:", new Date().toISOString());
  console.log("Fetching giveaways from GamerPower...");
  const list = await fetchGiveaways();

  console.log("Giveaway count:", list.length);
  if (list.length === 0) {
    await logWarn("Giveaway cron skipped: empty list");
    return;
  }
  console.log("Sample giveaway:", list[0]);

  for (const g of list) {
    try {
      if (!g.type || !g.type.toLowerCase().includes("game")) continue;
      if (!isSteamOrEpic(g.platforms)) continue;

      if (g.end_date && g.end_date !== "N/A") {
        if (new Date(g.end_date) <= new Date()) continue;
      }

      const giveawayId = String(g.id);
      if (await storage.existsGiveaway(giveawayId)) continue;

      let finalUrl = g.open_giveaway_url;

      // Steam resolution
const resolved = await resolveFinalUrl(g);
if (resolved) {
  finalUrl = resolved;
  await storage.updateResolvedGiveaway(g.id, resolved);
}



      console.log("Final URL:", finalUrl);

      const channel = client.channels.cache.get(GIVEAWAY_CHANNEL_ID) as TextChannel;
      if (!channel) continue;

      const platformLabel = g.platforms;

      const ends =
        typeof g.end_date === "string" && g.end_date !== "N/A"
          ? g.end_date
          : "Limited time";

      const embed = new EmbedBuilder()
        .setTitle(g.title || "Free Game")
        .setDescription(g.description?.slice(0, 2048) || "Free game available!")
        .addFields(
          { name: "Platform", value: platformLabel, inline: true },
          { name: "Ends", value: ends, inline: true }
        );

      if (finalUrl.startsWith("http")) {
        embed.setURL(finalUrl);
      }

      if (typeof g.image === "string" && g.image.startsWith("http")) {
        embed.setImage(g.image);
      }

      console.log("Posting giveaway:", g.title, g.platforms);
      await channel.send({ embeds: [embed] });
      try {
        await storage.insertGiveawayPosted(giveawayId, finalUrl);
      } catch (err) {
        await logError(`DB insert failed for giveaway ${giveawayId}`, err);
      }

    } catch (err) {
      console.error("Giveaway skipped due to error:", g?.id, err);
    }
  }
}

//fetch msg thing
async function fetchAllMessages(channel: TextChannel) {
  let lastId: string | undefined;
  const allMessages = [];

  while (true) {
    const fetched = await channel.messages.fetch({
      limit: 100,
      before: lastId,
    });

    if (fetched.size === 0) break;

    allMessages.push(...Array.from(fetched.values()));
    lastId = fetched.last()!.id;
  }

  return allMessages;
}

// Shutdown logs
process.on("SIGINT", async () => {
  await logWarn("Bot shutting down (SIGINT)");
  process.exit(0);
});

// Unhandled crashes
process.on("unhandledRejection", (reason) => {
  logError("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (err) => {
  logError("Uncaught exception", err);
});
