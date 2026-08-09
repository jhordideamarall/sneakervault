export function Greeting({ name }: { name: string }) {
  // Vercel renders in UTC while operators work in WIB. Computing both the
  // server and initial browser markup from an explicit timezone prevents the
  // greeting text from changing during hydration.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Jakarta",
    }).format(new Date()),
  );
  const greeting =
    hour < 12 ? "Selamat pagi" : hour < 17 ? "Selamat siang" : "Selamat malam";

  return (
    <h1 className="text-2xl font-bold text-white/90">
      {`${greeting}, ${name} 👋`}
    </h1>
  );
}
