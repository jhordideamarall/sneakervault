import { login } from "@/lib/actions/auth";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ inactive?: string }>;
}) {
  const params = await searchParams;
  const inactive = params?.inactive === "1";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1F1F1E] px-4 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(16,185,129,0.14),transparent_32%),radial-gradient(circle_at_75%_75%,rgba(59,130,246,0.12),transparent_30%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#262626] shadow-2xl md:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden min-h-[560px] flex-col justify-between border-r border-white/[0.06] bg-[#1A1A19] p-8 md:flex">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-xl">
              D.
            </div>
            <h1 className="mt-8 max-w-sm text-4xl font-semibold leading-tight tracking-normal text-white">
              Dewinst.id
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/55">
              Operasi gudang, packing, return, dan finance dalam satu dashboard internal.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              ["Stok", "Realtime"],
              ["Audit", "Aktif"],
              ["Mail", "Internal"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-[11px] text-white/60">{label}</p>
                <p className="mt-1 text-sm font-medium text-white/80">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-[560px] items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 md:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-sm font-semibold">
                D.
              </div>
              <h1 className="mt-5 text-2xl font-semibold text-white">Dewinst.id</h1>
              <p className="mt-2 text-sm text-white/50">Masuk ke sistem gudang</p>
            </div>

            <div className="mb-7 hidden md:block">
              <p className="text-xs font-medium uppercase text-emerald-300/80">Internal Access</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Masuk ke akun</h2>
              <p className="mt-2 text-sm text-white/60">Gunakan kredensial staf yang sudah terdaftar.</p>
            </div>

            <LoginForm action={login} inactive={inactive} />
          </div>
        </div>
      </section>
    </main>
  );
}
