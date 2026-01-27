import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  warned?: boolean;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  let styles = "border-white/5 text-white/20";
  let label = status;

  switch (status) {
    case "verified":
      styles = "bg-emerald-500/5 text-emerald-400 border-emerald-500/20";
      label = "Verified";
      break;
    case "warned_5m":
      styles = "bg-amber-500/5 text-amber-400 border-amber-500/20";
      label = "Warning_5m";
      break;
    case "kicked":
      styles = "bg-red-500/5 text-red-400 border-red-500/20";
      label = "Kicked";
      break;
    case "veteran":
      styles = "bg-blue-500/5 text-blue-400 border-blue-500/20";
      label = "Veteran";
      break;
    default:
      styles = "bg-white/5 text-white/30 border-white/10";
      label = "Pending";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 border rounded-full text-[10px] font-medium tracking-wide ${styles}`}>
      {label}
    </span>
  );
}
