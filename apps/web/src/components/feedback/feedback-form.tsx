"use client";

import { useState } from "react";
import { ImageUp, X } from "lucide-react";
import { createClient } from "@sneakervault/supabase/client";
import { createFeedback } from "@/lib/actions/feedback";

type Props = {
  defaultPath: string;
  userId: string;
  onDone: () => void;
};

const SEVERITIES = [
  { v: "blocker", label: "🔴 Blocker (tidak bisa lanjut)" },
  { v: "mengganggu", label: "🟡 Mengganggu (ada workaround)" },
  { v: "minor", label: "🟢 Minor (kosmetik)" },
] as const;

export function FeedbackForm({ defaultPath, userId, onDone }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"blocker" | "mengganggu" | "minor">(
    "mengganggu",
  );
  const [pagePath, setPagePath] = useState(defaultPath);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const uploaded: { file_path: string; file_name: string }[] = [];
      for (const f of files) {
        const path = `${userId}/${crypto.randomUUID()}-${f.name}`;
        const { error } = await supabase.storage
          .from("feedback-screenshots")
          .upload(path, f);
        if (error) throw new Error("Upload screenshot gagal: " + error.message);
        uploaded.push({ file_path: path, file_name: f.name });
      }
      const viewport = `${window.innerWidth}x${window.innerHeight}`;
      const res = await createFeedback(
        {
          title,
          description,
          severity,
          page_path: pagePath,
          user_agent: navigator.userAgent,
          viewport,
        },
        uploaded,
      );
      if ("error" in res) {
        setErr("Periksa input: judul/deskripsi wajib diisi.");
        return;
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengirim");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-white/50">Judul masalah</span>
        <input
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Stok tidak turun setelah checkout"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-white/50">Langkah + apa yang terjadi</span>
        <textarea
          className="min-h-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Jual Samba size 42, klik bayar cash, struk keluar tapi stok tetap 5."
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-white/50">Tingkat</span>
        <select
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as typeof severity)}
        >
          {SEVERITIES.map((s) => (
            <option key={s.v} value={s.v} className="bg-neutral-900">
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-white/50">Halaman (otomatis, bisa diedit)</span>
        <input
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs"
          value={pagePath}
          onChange={(e) => setPagePath(e.target.value)}
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-white/50">Screenshot (boleh lebih dari satu)</span>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/[0.03] px-3 py-4 text-white/60 transition-colors hover:border-amber-400/60 hover:bg-amber-400/5 hover:text-amber-200">
          <ImageUp size={18} />
          <span>Klik untuk pilih gambar / screenshot</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) =>
              setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])
            }
          />
        </label>
        {files.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md bg-white/[0.04] px-2 py-1.5 text-xs text-white/70"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    setFiles((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="shrink-0 text-white/40 hover:text-red-300"
                  aria-label="Hapus screenshot"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {err && <p className="text-red-400">{err}</p>}
      <button
        disabled={busy || !title.trim() || !description.trim()}
        onClick={submit}
        className="rounded-lg bg-white/90 px-4 py-2 font-medium text-black disabled:opacity-40"
      >
        {busy ? "Mengirim…" : "Kirim Laporan"}
      </button>
    </div>
  );
}
