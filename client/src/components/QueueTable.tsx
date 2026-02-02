import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";

interface GuildInfo {
  guildId: string;
  moderationEnabled: boolean;
  giveawaysEnabled: boolean;
}

interface GuildTableProps {
  guilds: GuildInfo[];
  isLoading: boolean;
}

export function QueueTable({ guilds, isLoading }: GuildTableProps) {
  if (isLoading) {
    return (
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-8 flex flex-col items-center justify-center min-h-[300px]">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/40 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 text-sm animate-pulse tracking-tight">Loading guilds...</p>
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-12 text-center">
        <div className="w-12 h-12 bg-white/5 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">No Guilds Configured</h3>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">
          Run /setup in a Discord server to get started.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-white/80 text-sm font-medium flex items-center gap-2">
          Configured Guilds
        </h3>
        <span className="text-[10px] text-white/20 font-medium uppercase tracking-widest">
          {guilds.length} Guilds
        </span>
      </div>

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
            {guilds.map((guild, i) => (
              <motion.tr
                key={guild.guildId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
                className="group hover:bg-white/[0.01] transition-colors"
              >
                <td className="px-6 py-4">
                  <span className="font-medium text-white/90">{guild.guildId}</span>
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
    </motion.div>
  );
}
