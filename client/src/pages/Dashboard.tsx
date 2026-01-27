import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Crown, AlertTriangle, Activity } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { QueueTable } from "@/components/QueueTable";
import { StatusBadge } from "@/components/StatusBadge";
import { useDashboard } from "@/hooks/use-dashboard";

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
          <p className="text-white/60">Monitor Discord community's activity and status</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            label="Total Users"
            value={data.totalUsers}
            icon={Users}
            color="text-purple-400"
            delay={0}
          />
          <MetricCard
            label="Veteran Users"
            value={data.veteranUsers}
            icon={Crown}
            color="text-blue-400"
            delay={0.1}
          />
          <MetricCard
            label="Warned Users"
            value={data.warnedUsers}
            icon={AlertTriangle}
            color="text-red-400"
            delay={0.2}
          />
          <MetricCard
            label="System Status"
            value={data.systemStatus}
            icon={Activity}
            color={data.systemStatus === 'ACTIVE' ? 'text-green-400' : 'text-red-400'}
            delay={0.3}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-white/[0.02] border border-white/5 rounded-2xl p-6"
        >
          <h2 className="text-xl font-semibold text-white mb-4">All Members</h2>
          <QueueTable users={data.users} isLoading={isLoading} />
        </motion.div>
      </div>
    </div>
  );
}
