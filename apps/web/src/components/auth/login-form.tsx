"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
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
        <label htmlFor="email" className="block text-sm font-medium text-primary">Email</label>
        <input
          id="email" name="email" type="email" required
          className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder="admin@sneakervault.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-primary">Password</label>
        <input
          id="password" name="password" type="password" required
          className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder="••••••••"
        />
      </div>
      {error && <p className="text-xs text-highlight">{error}</p>}
      <SubmitButton />
    </form>
  );
}
