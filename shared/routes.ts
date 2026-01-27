import { z } from "zod";
import { insertUserSchema, users } from "./schema";

export const api = {
  status: {
    get: {
      method: "GET" as const,
      path: "/api/status",
      responses: {
        200: z.object({
          online: z.boolean(),
          uptime: z.number(),
          trackedUsersCount: z.number(),
        }),
      },
    },
  },
  members: {
    list: {
      method: "GET" as const,
      path: "/api/members",
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      },
    },
  },
};
