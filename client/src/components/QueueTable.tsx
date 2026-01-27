import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import type { User } from "@shared/schema";
import { StatusBadge } from "./StatusBadge";
import { Clock, ShieldAlert, User as UserIcon } from "lucide-react";

interface QueueTableProps {
  users: User[];
  isLoading: boolean;
}

export function QueueTable({ users, isLoading }: QueueTableProps) {
  if (isLoading) {
    return (
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-8 flex flex-col items-center justify-center min-h-[300px]">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/40 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 text-sm animate-pulse tracking-tight">Scanning queue...</p>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-12 text-center">
        <div className="w-12 h-12 bg-white/5 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Queue Empty</h3>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">
          No users are currently pending verification.
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
          Verification Activity Log
        </h3>
        <span className="text-[10px] text-white/20 font-medium uppercase tracking-widest">
          {users.length} Entries Detected
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-white/5 text-white/30 uppercase text-[10px] font-medium tracking-wider">
              <th className="px-6 py-4">Identity</th>
              <th className="px-6 py-4">Registered</th>
              <th className="px-6 py-4 text-center">Intro</th>
              <th className="px-6 py-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((user, i) => (
              <motion.tr 
                key={user.discordId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
                className="group hover:bg-white/[0.01] transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-medium text-white/90">
                      {user.username}
                    </span>
                    <span className="text-[10px] text-white/20">
                      {user.discordId}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-white/40">
                  {formatDistanceToNow(new Date(user.joinedAt), { addSuffix: true })}
                </td>
                <td className="px-6 py-4 text-center text-white/40 font-medium">
                  {user.status === 'verified' ? '✓' : '—'}
                </td>
                <td className="px-6 py-4 text-right">
                  <StatusBadge status={user.status} warned={user.warned ?? false} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
