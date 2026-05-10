export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded-lg bg-white/[0.04]" />
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded-lg bg-white/[0.03]" />
          <div className="h-9 w-24 rounded-lg bg-white/[0.03]" />
        </div>
      </div>
      <div className="h-10 w-full rounded-xl bg-white/[0.03]" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-white/[0.02]" />
        ))}
      </div>
    </div>
  );
}
