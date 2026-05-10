export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-white/[0.04]" />
      <div className="h-4 w-72 rounded bg-white/[0.03]" />
      <div className="grid gap-4 grid-cols-2 mt-8">
        <div className="h-32 rounded-2xl bg-white/[0.03]" />
        <div className="h-32 rounded-2xl bg-white/[0.03]" />
      </div>
      <div className="h-64 rounded-2xl bg-white/[0.03] mt-4" />
      <div className="space-y-3 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-white/[0.02]" />
        ))}
      </div>
    </div>
  );
}
