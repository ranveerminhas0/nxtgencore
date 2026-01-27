import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { startBot, botStatus } from "./bot";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Dashboard API
  app.get(api.status.get.path, async (_req, res) => {
    try {
      const uptime = botStatus.online ? Date.now() - botStatus.startTime : 0;
      const users = await storage.getUsers();
      res.json({
        online: botStatus.online,
        uptime,
        trackedUsersCount: users.filter(u => u.status !== 'verified').length
      });
    } catch (e) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get(api.members.list.path, async (_req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (e) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  // Dashboard data endpoint
  app.get("/api/dashboard", async (_req, res) => {
    try {
      const users = await storage.getUsers();
      const totalUsers = users.length;
      const veteranUsers = users.filter(u => u.status === 'veteran').length;
      const warnedUsers = users.filter(u => u.warned).length;
      const systemStatus = botStatus.online ? 'ACTIVE' : 'DOWN';

      res.json({
        totalUsers,
        veteranUsers,
        warnedUsers,
        systemStatus,
        users: users // Show all users
      });
    } catch (e) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  return httpServer;
}
