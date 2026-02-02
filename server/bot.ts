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
  ApplicationIntegrationType,
  InteractionContextType,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { storage } from "./storage";
import fetch from "node-fetch";
import { logInfo, logError, logWarn } from "./logger";
import { handlePlay, handleSkip, handleStop, handleQueue } from "./music/commands";

// ============================================
// CLIENT SETUP
// ============================================
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Reaction],
});

export const botStatus = {
  online: false,
  uptime: 0,
  startTime: Date.now(),
};

const commandIds = new Map<string, string>();

// ============================================
// HELPER: Convert Discord Snowflake to BigInt
// ============================================
function toBigInt(id: string): bigint {
  return BigInt(id);
}

// ============================================
// COMMAND REGISTRATION  
// ============================================
async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) return;

  const globalCommands = [
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Tells you what the bot does"),
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Configure the bot for this server (Admin only)")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addChannelOption((option) =>
        option
          .setName("intro_channel")
          .setDescription("Channel for introductions")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false),
      )
      .addRoleOption((option) =>
        option
          .setName("unverified_role")
          .setDescription("Role for unverified members")
          .setRequired(false),
      )
      .addRoleOption((option) =>
        option
          .setName("verified_role")
          .setDescription("Role for verified members (optional)")
          .setRequired(false),
      )
      .addChannelOption((option) =>
        option
          .setName("giveaways_channel")
          .setDescription("Channel for giveaway posts")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName("moderation_enabled")
          .setDescription("Enable onboarding/moderation features")
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName("giveaways_enabled")
          .setDescription("Enable automatic giveaway posting")
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("intro_timeout")
          .setDescription("Seconds before warning unverified users (default: 300)")
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("status")
      .setDescription("Check verification and activity status")
      .setIntegrationTypes([
        ApplicationIntegrationType.GuildInstall,
        ApplicationIntegrationType.UserInstall,
      ])
      .setContexts([
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ])
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
      .setIntegrationTypes([
        ApplicationIntegrationType.GuildInstall,
        ApplicationIntegrationType.UserInstall,
      ])
      .setContexts([
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ])
      .addStringOption((option) =>
        option
          .setName("prompt")
          .setDescription("Your question for the AI")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("play")
      .setDescription("Play music from a URL or search query")
      .setIntegrationTypes([
        ApplicationIntegrationType.GuildInstall,
        ApplicationIntegrationType.UserInstall,
      ])
      .setContexts([
        InteractionContextType.Guild,
      ])
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
    new SlashCommandBuilder()
      .setName("scan")
      .setDescription("Scan a channel for introductions (Admin only)")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to scan for introductions")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    console.log("Refreshing global application commands...");
    await rest.put(Routes.applicationCommands(client.user!.id), { body: globalCommands });
    console.log("Successfully registered global commands.");
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

// ============================================
// BOT START
// ============================================
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

// ============================================
// CLIENT READY
// ============================================
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  await logWarn("Bot started successfully");

  botStatus.online = true;
  botStatus.startTime = Date.now();

  setInterval(() => {
    botStatus.online = client.isReady();
  }, 10_000);

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

  await registerCommands();
  await loadCommandIds();

  // Start cron tasks
  startCronTasks();
});

// ============================================
// CRON TASKS (Onboarding Warnings + Giveaways)
// ============================================
function startCronTasks() {
  // Task 1: Onboarding warnings every 1 minute
  setInterval(processOnboardingWarnings, 60 * 1000);

  // Task 2: Giveaway fetch every 1 hour
  setInterval(fetchAndDistributeGiveaways, 60 * 60 * 1000);

  // Run giveaways immediately on startup
  fetchAndDistributeGiveaways();

  console.log("Cron tasks started.");
}

async function processOnboardingWarnings() {
  const guilds = await storage.getAllConfiguredGuilds();

  for (const settings of guilds) {
    if (!settings.moderationEnabled || !settings.introReminderEnabled) continue;
    if (!settings.introChannelId) continue;

    try {
      const now = new Date();
      const cutoffTime = new Date(now.getTime() - settings.introTimeoutSeconds * 1000);



      const pending = await storage.getPendingVerificationsToWarn(
        settings.guildId,
        settings.introTimeoutSeconds
      );



      if (pending.length === 0) continue;

      const guild = client.guilds.cache.get(settings.guildId.toString());
      if (!guild) continue;

      const introChannel = guild.channels.cache.get(settings.introChannelId.toString()) as TextChannel;
      if (!introChannel) continue;

      for (const pv of pending) {
        try {
          const member = await guild.members.fetch(pv.discordId.toString()).catch(() => null);
          if (!member) {
            // User left, remove from pending
            await storage.removePendingVerification(settings.guildId, pv.discordId);
            continue;
          }

          await introChannel.send(
            `${member.toString()}, please send your introduction in this channel or you may be kicked.`
          );
          await storage.markReminderSent(settings.guildId, pv.discordId);
          console.log(`Warned user ${member.user.tag} in guild ${guild.name}`);
        } catch (err) {
          console.error(`Failed to warn user ${pv.discordId}:`, err);
        }
      }
    } catch (err) {
      console.error(`Failed to process warnings for guild ${settings.guildId}:`, err);
    }
  }
}

// ============================================
// INTERACTION HANDLER
// ============================================
client.on("interactionCreate", async (interaction) => {
  // Handle History Interactions (Buttons & Select Menus)
  if (
    (interaction.isStringSelectMenu() && interaction.customId === "hist_select") ||
    (interaction.isButton() && (interaction.customId === "hist_add_all" || interaction.customId === "hist_confirm_add"))
  ) {
    const { handleHistoryInteraction } = await import("./music/commands");
    await handleHistoryInteraction(interaction);
    return;
  }

  if (interaction.isButton()) {
    const { handleButtonInteraction } = await import("./music/commands");
    await handleButtonInteraction(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case "help":
        await handleHelpCommand(interaction);
        break;

      case "setup":
        await handleSetupCommand(interaction);
        break;

      case "status":
        await handleStatusCommand(interaction);
        break;

      case "admhelp":
        await handleAdmhelpCommand(interaction);
        break;

      case "scan":
        await handleScanCommand(interaction);
        break;

      case "aihelp":
        await handleAihelpCommand(interaction);
        break;

      case "play":
        await handlePlay(interaction);
        break;

      case "skip":
        await handleSkip(interaction);
        break;

      case "stop":
        await handleStop(interaction);
        break;

      case "queue":
        await handleQueue(interaction);
        break;
    }
  } catch (err) {
    console.error("Command handler crash:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Command failed unexpectedly.",
        ephemeral: true,
      });
    }
  }
});

// ============================================
// COMMAND HANDLERS
// ============================================
async function handleHelpCommand(interaction: any) {
  const aihelpId = commandIds.get("aihelp");
  const statusId = commandIds.get("status");
  const helpId = commandIds.get("help");
  const setupId = commandIds.get("setup");

  if (!aihelpId || !statusId || !helpId) {
    await interaction.reply({
      content: "Commands are still syncing. Please try again in a moment.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `***Hey there***,\nI'm the Internal Infrastructure Bot for the Next Gen Programmers server.  \nThese commands will help you around 😊\n\n</aihelp:${aihelpId}> - Ask the internal AI assistant for help with questions\n</status:${statusId}> - Check your verification and activity status\n</help:${helpId}> - Come back here if you're Lost${setupId ? `\n</setup:${setupId}> - Configure bot for your server (Admin)` : ""}`,
    ephemeral: false,
  });
}

async function handleSetupCommand(interaction: any) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const guildId = toBigInt(interaction.guild.id);
  const introChannel = interaction.options.getChannel("intro_channel");
  const unverifiedRole = interaction.options.getRole("unverified_role");
  const verifiedRole = interaction.options.getRole("verified_role");
  const giveawaysChannel = interaction.options.getChannel("giveaways_channel");
  const moderationEnabled = interaction.options.getBoolean("moderation_enabled");
  const giveawaysEnabled = interaction.options.getBoolean("giveaways_enabled");
  const introTimeout = interaction.options.getInteger("intro_timeout");

  // Get existing settings or create defaults
  const existing = await storage.getGuildSettings(guildId);

  // Validation: If moderation is enabled, require intro channel and unverified role
  const finalModerationEnabled = moderationEnabled ?? existing?.moderationEnabled ?? true;
  if (finalModerationEnabled) {
    const finalIntroChannel = introChannel?.id ? toBigInt(introChannel.id) : existing?.introChannelId;
    const finalUnverifiedRole = unverifiedRole?.id ? toBigInt(unverifiedRole.id) : existing?.unverifiedRoleId;

    if (!finalIntroChannel || !finalUnverifiedRole) {
      await interaction.reply({
        content: "⚠️ **Moderation is enabled.** You must provide `intro_channel` and `unverified_role` for onboarding features to work.\n\nEither:\n1. Provide both now, OR\n2. Set `moderation_enabled` to `false`",
        ephemeral: true,
      });
      return;
    }
  }

  const settings = await storage.upsertGuildSettings({
    guildId,
    introChannelId: introChannel?.id ? toBigInt(introChannel.id) : existing?.introChannelId,
    logChannelId: existing?.logChannelId,
    unverifiedRoleId: unverifiedRole?.id ? toBigInt(unverifiedRole.id) : existing?.unverifiedRoleId,
    verifiedRoleId: verifiedRole?.id ? toBigInt(verifiedRole.id) : existing?.verifiedRoleId,
    introTimeoutSeconds: introTimeout ?? existing?.introTimeoutSeconds ?? 300,
    introReminderEnabled: existing?.introReminderEnabled ?? true,
    moderationEnabled: finalModerationEnabled,
    aiEnabled: existing?.aiEnabled ?? true,
    musicEnabled: existing?.musicEnabled ?? true,
    giveawaysEnabled: giveawaysEnabled ?? existing?.giveawaysEnabled ?? true,
    giveawaysChannelId: giveawaysChannel?.id ? toBigInt(giveawaysChannel.id) : existing?.giveawaysChannelId,
    configuredBy: toBigInt(interaction.user.id),
  });

  const lines = [
    "✅ **Server configured successfully!**",
    "",
    `**Moderation:** ${settings.moderationEnabled ? "Enabled" : "Disabled"}`,
  ];

  if (settings.moderationEnabled) {
    lines.push(`  • Intro Channel: ${settings.introChannelId ? `<#${settings.introChannelId}>` : "Not set"}`);
    lines.push(`  • Unverified Role: ${settings.unverifiedRoleId ? `<@&${settings.unverifiedRoleId}>` : "Not set"}`);
    lines.push(`  • Verified Role: ${settings.verifiedRoleId ? `<@&${settings.verifiedRoleId}>` : "Not set"}`);
    lines.push(`  • Timeout: ${settings.introTimeoutSeconds}s`);
  }

  lines.push(`**Giveaways:** ${settings.giveawaysEnabled ? "Enabled" : "Disabled"}`);
  if (settings.giveawaysEnabled) {
    lines.push(`  • Channel: ${settings.giveawaysChannelId ? `<#${settings.giveawaysChannelId}>` : "Not set"}`);
  }

  await interaction.reply({
    content: lines.join("\n"),
    ephemeral: true,
  });
}

async function handleStatusCommand(interaction: any) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command must be used in a server to check status.",
      ephemeral: true,
    });
    return;
  }

  const guildId = toBigInt(interaction.guild.id);
  const settings = await storage.getGuildSettings(guildId);

  if (!settings) {
    await interaction.reply({
      content: "⚠️ Server not configured. An admin needs to run `/setup` first.",
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("target") || interaction.user;
  const user = await storage.getUser(guildId, toBigInt(targetUser.id));

  if (!user) {
    await interaction.reply({
      content: `${targetUser.username} is not currently being tracked.`,
      ephemeral: false,
    });
    return;
  }

  const botOnlineSince = new Date(botStatus.startTime).toLocaleString();

  const introductionLine = user.introductionMessageId
    ? `Introduction: Completed - [View](https://discord.com/channels/${interaction.guild.id}/${settings.introChannelId}/${user.introductionMessageId})`
    : `Introduction: Not completed`;

  const content =
    `**Status for ${targetUser.username}**:\n` +
    `Joined: ${user.joinedAt.toLocaleDateString()}\n` +
    `Active: ${user.isActive ? "Yes" : "No"}\n` +
    `${introductionLine}\n\n` +
    `***Bot info:***\n` +
    `• Bot online since: ${botOnlineSince}`;

  await interaction.reply({
    content,
    ephemeral: false,
  });
}

async function handleAdmhelpCommand(interaction: any) {
  const hasAdminPermission = interaction.memberPermissions?.has("Administrator");
  const hasAdminRole = (interaction.member?.roles as any).cache.some(
    (role: any) => role.name === "Admin",
  );

  if (!hasAdminPermission && !hasAdminRole) {
    await interaction.reply({
      content: "You need Administrator permissions or the 'Admin' role to use this command.",
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
        content: "Failed to send the message. Check my permissions in that channel.",
        ephemeral: true,
      });
    }
  }
}

async function handleScanCommand(interaction: any) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const guildId = toBigInt(interaction.guild.id);
  const settings = await storage.getGuildSettings(guildId);

  if (!settings) {
    await interaction.reply({
      content: "⚠️ Server not configured. Run `/setup` first.",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel("channel", true);

  await interaction.reply({
    content: `Starting scan of ${channel.toString()}...`,
    ephemeral: false,
  });

  try {
    const messages = await fetchAllMessages(channel as TextChannel);

    await interaction.editReply({
      content: `Scanning ${channel.toString()}...\nMessages scanned: ${messages.length}\nProcessing introductions...`,
    });

    const introMap = new Map<string, { messageId: string; username: string }>();

    for (const msg of messages.reverse()) {
      if (msg.author.bot) continue;
      if (msg.reference?.messageId) continue;

      if (!introMap.has(msg.author.id)) {
        introMap.set(msg.author.id, { messageId: msg.id, username: msg.author.username });
      }
    }

    const totalUsers = introMap.size;
    let updatedCount = 0;

    for (const [userId, { messageId, username }] of Array.from(introMap.entries())) {
      // First: upsert user (creates if doesn't exist)
      await storage.upsertUser(guildId, toBigInt(userId), username);

      // Then: update intro message ID
      const updated = await storage.updateIntroduction(
        guildId,
        toBigInt(userId),
        toBigInt(messageId)
      );
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

async function handleAihelpCommand(interaction: any) {
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
    } catch { }
  }
}

// ============================================
// EVENT: MEMBER JOIN
// ============================================
client.on("guildMemberAdd", async (member) => {
  console.log(`Member joined: ${member.user.tag} in ${member.guild.name}`);

  const guildId = toBigInt(member.guild.id);
  const settings = await storage.getGuildSettings(guildId);

  // Silently ignore if not configured
  if (!settings) return;
  if (!settings.moderationEnabled) return;

  try {
    // Upsert user
    await storage.upsertUser(guildId, toBigInt(member.id), member.user.tag);

    // Add to pending verifications
    await storage.addPendingVerification(guildId, toBigInt(member.id));

    // Assign unverified role
    if (settings.unverifiedRoleId) {
      const role = member.guild.roles.cache.get(settings.unverifiedRoleId.toString());
      if (role) {
        await member.roles.add(role);
        console.log(`Assigned unverified role to ${member.user.tag}`);
      }
    }
  } catch (err) {
    console.error("Error handling member join:", err);
  }
});

// ============================================
// EVENT: MEMBER LEAVE
// ============================================
client.on("guildMemberRemove", async (member) => {
  console.log(`Member left: ${member.user.tag} from ${member.guild.name}`);

  const guildId = toBigInt(member.guild.id);
  const settings = await storage.getGuildSettings(guildId);

  // Silently ignore if not configured
  if (!settings) return;

  try {
    await storage.markUserInactive(guildId, toBigInt(member.id));
    await storage.removePendingVerification(guildId, toBigInt(member.id));
  } catch (err) {
    console.error("Error handling member leave:", err);
  }
});

// ============================================
// EVENT: MESSAGE CREATE (Verification)
// ============================================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Handle music prefix commands
  if (message.content === "!mlock") {
    const { handleLockCommand } = await import("./music/commands");
    await handleLockCommand(message);
    return;
  }

  if (message.content === "!munlock") {
    const { handleUnlockCommand } = await import("./music/commands");
    await handleUnlockCommand(message);
    return;
  }

  if (message.content === "!mhistory") {
    const { handleHistoryCommand } = await import("./music/commands");
    await handleHistoryCommand(message);
    return;
  }

  const member = message.member;
  if (!member) return;

  const guildId = toBigInt(message.guild.id);
  const settings = await storage.getGuildSettings(guildId);

  // Silently ignore if not configured
  if (!settings) return;
  if (!settings.moderationEnabled) return;
  if (!settings.introChannelId) return;

  // Verification logic (Introduction channel)
  if (message.channelId === settings.introChannelId.toString()) {
    // Check if user has unverified role
    if (settings.unverifiedRoleId) {
      const unverifiedRole = member.guild.roles.cache.get(settings.unverifiedRoleId.toString());
      if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
        try {
          // Remove unverified role
          await member.roles.remove(unverifiedRole);

          // Add verified role if configured
          if (settings.verifiedRoleId) {
            const verifiedRole = member.guild.roles.cache.get(settings.verifiedRoleId.toString());
            if (verifiedRole) {
              await member.roles.add(verifiedRole);
            }
          }

          // Update introduction message
          await storage.updateIntroduction(guildId, toBigInt(member.id), toBigInt(message.id));

          // Remove from pending verifications
          await storage.removePendingVerification(guildId, toBigInt(member.id));

          console.log(`Verified user ${member.user.tag} in ${member.guild.name}`);
        } catch (error) {
          console.error(`Failed to verify ${member.user.tag}:`, error);
        }
      }
    }
  }
});

// ============================================
// GIVEAWAY FUNCTIONS
// ============================================
function isSupportedPlatform(platforms: string | undefined): boolean {
  if (!platforms) return false;
  const p = platforms.toLowerCase();
  return p.includes("steam") || p.includes("epic") || p.includes("gog");
}

async function fetchGiveawaysFromAPI(): Promise<any[]> {
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
  if (g.platforms?.toLowerCase().includes("steam")) {
    try {
      const res = await fetch(g.open_giveaway_url);
      const html = await res.text();
      const match = html.match(/https:\/\/store\.steampowered\.com\/app\/\d+/);
      if (match) return match[0];
    } catch (err) {
      await logWarn(`URL resolution failed for giveaway ${g.id}`);
    }
  }

  if (g.platforms?.toLowerCase().includes("epic")) {
    try {
      const res = await fetch(g.open_giveaway_url, { redirect: "follow" });
      return res.url;
    } catch (err) {
      await logWarn(`URL resolution failed for giveaway ${g.id}`);
    }
  }

  if (g.platforms?.toLowerCase().includes("gog")) {
    try {
      const res = await fetch(g.open_giveaway_url, { redirect: "follow" });
      return res.url;
    } catch (err) {
      await logWarn(`URL resolution failed for giveaway ${g.id}`);
    }
  }

  return null;
}

async function fetchAndDistributeGiveaways() {
  console.log("Giveaway cron tick:", new Date().toISOString());

  // Fetch from API
  const list = await fetchGiveawaysFromAPI();
  if (list.length === 0) {
    await logWarn("Giveaway cron skipped: empty list");
    return;
  }

  // Get all configured guilds
  const guilds = await storage.getAllConfiguredGuilds();
  const enabledGuilds = guilds.filter(g => g.giveawaysEnabled && g.giveawaysChannelId);

  if (enabledGuilds.length === 0) {
    console.log("No guilds have giveaways enabled");
    return;
  }

  for (const g of list) {
    try {
      if (!g.type || !g.type.toLowerCase().includes("game")) continue;
      if (!isSupportedPlatform(g.platforms)) continue;

      if (g.end_date && g.end_date !== "N/A") {
        if (new Date(g.end_date) <= new Date()) continue;
      }

      const giveawayId = String(g.id);

      // Resolve URL
      let finalUrl = g.open_giveaway_url;
      const resolved = await resolveFinalUrl(g);
      if (resolved) {
        finalUrl = resolved;
      }

      if (!finalUrl) continue;

      // Insert into giveaways table first (for foreign key + dedup tracking)
      const provider = g.platforms?.toLowerCase().includes("steam") ? "steam" :
        g.platforms?.toLowerCase().includes("epic") ? "epic" : "gog";

      await storage.insertGiveaway({
        giveawayId,
        provider,
        title: g.title || "Free Game",
        resolvedUrl: finalUrl,
        resolvedAt: resolved ? new Date() : null,
      });

      // Build embed once (with all API data including image)
      const platformLabel = g.platforms || "Unknown";
      const ends = g.end_date && g.end_date !== "N/A" ? g.end_date : "Limited time";

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

      // Add image if available (directly from API)
      if (typeof g.image === "string" && g.image.startsWith("http")) {
        embed.setImage(g.image);
      }

      // Post to each guild that hasn't seen it
      for (const settings of enabledGuilds) {
        try {
          // Check if already posted to this guild
          const alreadyPosted = await storage.hasGuildReceivedGiveaway(settings.guildId, giveawayId);
          if (alreadyPosted) continue;

          const guild = client.guilds.cache.get(settings.guildId.toString());
          if (!guild) continue;

          const channel = guild.channels.cache.get(settings.giveawaysChannelId!.toString()) as TextChannel;
          if (!channel) continue;

          // Post the giveaway
          console.log(`Posting giveaway "${g.title}" to guild ${guild.name}`);
          await channel.send({ embeds: [embed] });

          // Record after successful post
          await storage.recordGuildGiveaway(settings.guildId, giveawayId);
        } catch (err) {
          console.error(`Failed to post to guild ${settings.guildId}:`, err);
        }
      }
    } catch (err) {
      console.error("Error processing giveaway:", g?.id, err);
    }
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
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

// ============================================
// SHUTDOWN HANDLERS
// ============================================
process.on("SIGINT", async () => {
  await logWarn("Bot shutting down (SIGINT)");
  process.exit(0);
});

process.on("unhandledRejection", (reason) => {
  logError("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (err) => {
  logError("Uncaught exception", err);
});
