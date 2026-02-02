import { useState } from "react";
import { motion } from "framer-motion";
import { Server, Activity, Settings, Zap } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { useDashboard } from "@/hooks/use-dashboard";

interface GuildInfo {
  guildId: string;
  moderationEnabled: boolean;
  giveawaysEnabled: boolean;
}

export default function Dashboard() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl animate-pulse">
                <div className="h-4 bg-white/10 rounded mb-2"></div>
                <div className="h-8 bg-white/10 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Error Loading Dashboard</h1>
            <p className="text-white/60">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  const guilds: GuildInfo[] = data?.guilds || [];
  const moderationCount = guilds.filter(g => g.moderationEnabled).length;
  const giveawaysCount = guilds.filter(g => g.giveawaysEnabled).length;

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-white mb-2">NXT GEN CORE</h1>
          <p className="text-white/60">Multi-guild Discord bot management dashboard</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            label="Total Guilds"
            value={data?.totalGuilds || 0}
            icon={Server}
            color="text-purple-400"
            delay={0}
          />
          <MetricCard
            label="Moderation Active"
            value={moderationCount}
            icon={Settings}
            color="text-blue-400"
            delay={0.1}
          />
          <MetricCard
            label="Giveaways Active"
            value={giveawaysCount}
            icon={Zap}
            color="text-yellow-400"
            delay={0.2}
          />
          <MetricCard
            label="System Status"
            value={data?.systemStatus || 'UNKNOWN'}
            icon={Activity}
            color={data?.systemStatus === 'ACTIVE' ? 'text-green-400' : 'text-red-400'}
            delay={0.3}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-white/[0.02] border border-white/5 rounded-2xl p-6"
        >
          <h2 className="text-xl font-semibold text-white mb-4">Configured Guilds</h2>
          {guilds.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white/40">No guilds configured yet. Run /setup in a Discord server.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-white/5 text-white/30 uppercase text-[10px] font-medium tracking-wider">
                    <th className="px-6 py-4">Guild ID</th>
                    <th className="px-6 py-4 text-center">Moderation</th>
                    <th className="px-6 py-4 text-center">Giveaways</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {guilds.map((guild) => (
                    <motion.tr
                      key={guild.guildId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group hover:bg-white/[0.01] transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-white/90">
                        {guild.guildId}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${guild.moderationEnabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {guild.moderationEnabled ? 'ON' : 'OFF'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${guild.giveawaysEnabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {guild.giveawaysEnabled ? 'ON' : 'OFF'}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
