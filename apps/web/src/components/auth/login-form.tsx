"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold text-[#171717] transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Memproses..." : "Masuk"}
    </button>
  );
}

export function LoginForm({ action }: { action: (prev: unknown, formData: FormData) => Promise<unknown> }) {
  const [state, formAction] = useActionState(action, null);
  const error = state && typeof state === "object" && "error" in state
    ? Object.values((state as { error: Record<string, string[]> }).error).flat()[0]
    : "";

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-white/75">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mt-2 block w-full rounded-lg border border-white/[0.08] bg-[#1F1F1E] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-white/22 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
          placeholder="admin@sneakervault.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-white/75">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="mt-2 block w-full rounded-lg border border-white/[0.08] bg-[#1F1F1E] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-white/22 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
          placeholder="Password"
        />
      </div>
      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
