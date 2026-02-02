import { z } from "zod";

export const api = {
  status: {
    get: {
      method: "GET" as const,
      path: "/api/status",
      responses: {
        200: z.object({
          online: z.boolean(),
          uptime: z.number(),
          trackedGuildsCount: z.number(),
        }),
      },
    },
  },
  members: {
    list: {
      method: "GET" as const,
      path: "/api/members",
      responses: {
        200: z.array(z.object({
          guildId: z.string(),
          moderationEnabled: z.boolean(),
          giveawaysEnabled: z.boolean(),
          configuredAt: z.date(),
        })),
      },
    },
  },
};
