import type { ReactNode } from "react";

/**
 * Page header with title, subtitle, and optional action buttons.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-white/50">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

/**
 * Stat card for dashboard metrics.
 */
export function StatCard({
  label,
  value,
  sub,
  color = "gray",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "green" | "blue" | "amber" | "red" | "purple" | "gray";
}) {
  const dotColors = {
    green: "bg-emerald-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    purple: "bg-purple-500",
    gray: "bg-gray-400",
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 h-[calc(100vh/3)] flex flex-col justify-between">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${dotColors[color]}`} />
        <span className="text-sm font-medium text-white/50">{label}</span>
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight text-white/90">{value}</p>
        {sub && <p className="mt-1 text-sm text-white/30">{sub}</p>}
      </div>
    </div>
  );
}

/**
 * Empty state placeholder.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-16 px-8">
      {icon && <span className="text-4xl">{icon}</span>}
      <h3 className="mt-4 text-lg font-semibold text-gray-700">{title}</h3>
      {description && <p className="mt-2 text-sm text-gray-400 text-center max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * Section divider with label.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{children}</h2>
  );
}
