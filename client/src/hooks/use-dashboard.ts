import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { User, BotStatus } from "@shared/schema";

// Helper for refetch intervals
const REFRESH_INTERVAL = 10000; // 10 seconds

export function useBotStatus() {
  return useQuery({
    queryKey: [api.status.get.path],
    queryFn: async () => {
      const res = await fetch(api.status.get.path);
      if (!res.ok) throw new Error("Failed to fetch bot status");
      // Validate with Zod schema from routes
      return api.status.get.responses[200].parse(await res.json());
    },
    refetchInterval: REFRESH_INTERVAL,
  });
}

export function useTrackedMembers() {
  return useQuery({
    queryKey: [api.members.list.path],
    queryFn: async () => {
      const res = await fetch(api.members.list.path);
      if (!res.ok) throw new Error("Failed to fetch members");
      // Validate with Zod schema from routes
      return api.members.list.responses[200].parse(await res.json());
    },
    refetchInterval: REFRESH_INTERVAL,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      return res.json();
    },
    refetchInterval: REFRESH_INTERVAL,
  });
}
