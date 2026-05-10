export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-5 w-64 rounded bg-white/[0.04]" />
      <div className="grid gap-5 grid-cols-2">
        <div className="h-28 rounded-2xl bg-white/[0.03]" />
        <div className="h-28 rounded-2xl bg-white/[0.03]" />
      </div>
      <div className="grid gap-5 grid-cols-3">
        <div className="h-[33vh] rounded-2xl bg-white/[0.03]" />
        <div className="h-[33vh] rounded-2xl bg-white/[0.03]" />
        <div className="h-[33vh] rounded-2xl bg-white/[0.03]" />
      </div>
      <div className="h-64 rounded-2xl bg-white/[0.03]" />
    </div>
  );
}
