import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { startBot, botStatus } from "./bot";

// Simple API key auth middleware
function apiAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.API_SECRET;
  if (!secret) {
    return res.status(503).json({ message: "Dashboard API is not configured" });
  }
  if (req.headers["x-api-key"] !== secret) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Dashboard API - Bot Status
  app.get(api.status.get.path, apiAuth, async (_req, res) => {
    try {
      const uptime = botStatus.online ? Date.now() - botStatus.startTime : 0;
      const guilds = await storage.getAllConfiguredGuilds();
      res.json({
        online: botStatus.online,
        uptime,
        trackedGuildsCount: guilds.length
      });
    } catch (e) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  // Dashboard - List configured guilds
  app.get(api.members.list.path, apiAuth, async (_req, res) => {
    try {
      const guilds = await storage.getAllConfiguredGuilds();
      res.json(guilds.map(g => ({
        guildId: g.guildId.toString(),
        moderationEnabled: g.moderationEnabled,
        giveawaysEnabled: g.giveawaysEnabled,
        configuredAt: g.configuredAt
      })));
    } catch (e) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  // Dashboard data endpoint
  app.get("/api/dashboard", apiAuth, async (_req, res) => {
    try {
      const guilds = await storage.getAllConfiguredGuilds();
      const systemStatus = botStatus.online ? 'ACTIVE' : 'DOWN';

      res.json({
        totalGuilds: guilds.length,
        systemStatus,
        guilds: guilds.map(g => ({
          guildId: g.guildId.toString(),
          moderationEnabled: g.moderationEnabled,
          giveawaysEnabled: g.giveawaysEnabled,
        }))
      });
    } catch (e) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  return httpServer;
}
