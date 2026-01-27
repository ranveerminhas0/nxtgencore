import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendColor?: "text-green-500" | "text-yellow-500" | "text-red-500";
  color?: string; // Tailwind class for icon background
  delay?: number;
}

export function MetricCard({ 
  label, 
  value, 
  icon: Icon, 
  color = "text-white/80",
  delay = 0 
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl relative overflow-hidden group"
    >
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-white/30 uppercase tracking-widest">{label}</p>
          <h3 className={`text-2xl font-medium tracking-tight ${color}`}>{value}</h3>
        </div>
        <div className="text-white/10 group-hover:text-white/30 transition-colors">
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}
