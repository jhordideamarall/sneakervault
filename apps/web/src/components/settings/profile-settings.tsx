"use client";

import { useState, useTransition } from "react";
import { Button } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { updateProfile, updatePassword } from "@/lib/actions/profile";
import Image from "next/image";
import { createClient } from "@sneakervault/supabase/client";

type Props = {
  profile: { id: string; full_name: string; email: string; avatar_url: string | null };
};

export function ProfileSettings({ profile }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(profile.full_name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [uploading, setUploading] = useState(false);

  // Password
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState({ current: "", new: "", confirm: "" });
  const [showNewPw, setShowNewPw] = useState(false);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/avatar.${ext}`;

    const { error } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: true });
    if (error) {
      toast.push("Gagal upload foto", "error");
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("chat-attachments").getPublicUrl(path);
    setAvatarUrl(publicUrl);
    setUploading(false);
  }

  function handleSaveProfile() {
    startTransition(async () => {
      const result = await updateProfile({ full_name: name, avatar_url: avatarUrl });
      if ("error" in result) {
        toast.push(String(result.error), "error");
        return;
      }
      toast.push("Profil diperbarui", "success");
      router.refresh();
    });
  }

  function handleChangePassword() {
    if (pw.new !== pw.confirm) {
      toast.push("Password baru tidak cocok", "error");
      return;
    }
    if (pw.new.length < 6) {
      toast.push("Password minimal 6 karakter", "error");
      return;
    }
    startTransition(async () => {
      const result = await updatePassword(pw.new);
      if ("error" in result) {
        toast.push(String(result.error), "error");
        return;
      }
      toast.push("Password berhasil diubah", "success");
      setPw({ current: "", new: "", confirm: "" });
      setShowPw(false);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Akun Saya</h2>
        <p className="text-[12px] text-white/40">Kelola profil dan keamanan akun</p>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="relative">
            {avatarUrl ? (
              <Image src={avatarUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/10" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-white/[0.06] flex items-center justify-center text-xl font-bold text-white/40">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <label className="inline-block cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-medium text-white/60 hover:bg-white/[0.06] transition-colors">
              {uploading ? "Uploading..." : "Ganti Foto"}
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploading} />
            </label>
            <p className="text-[10px] text-white/20 mt-1">JPG, PNG, WEBP. Max 10MB.</p>
          </div>
        </div>

        {/* Name & Email */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] text-white/40 mb-1.5">Nama</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white/90 focus:border-white/[0.15] focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] text-white/40 mb-1.5">Email</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm text-white/30 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSaveProfile} disabled={pending || name === profile.full_name && avatarUrl === profile.avatar_url}>
            Simpan Profil
          </Button>
        </div>
      </div>

      {/* Password Section */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Password</p>
            <p className="text-[11px] text-white/30">Ubah password login kamu</p>
          </div>
          {!showPw && (
            <button onClick={() => setShowPw(true)} className="text-[12px] font-medium text-blue-400 hover:text-blue-300 transition-colors">
              Ubah Password
            </button>
          )}
        </div>

        {showPw && (
          <div className="mt-5 space-y-3">
            <div>
              <label className="block text-[11px] text-white/40 mb-1.5">Password baru</label>
              <div className="relative">
                <input
                  type={showNewPw ? "text" : "password"}
                  value={pw.new}
                  onChange={(e) => setPw(p => ({ ...p, new: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 pr-10 text-sm text-white/90 focus:border-white/[0.15] focus:outline-none transition-colors"
                />
                <button type="button" onClick={() => setShowNewPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  {showNewPw ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-white/40 mb-1.5">Konfirmasi password baru</label>
              <input
                type="password"
                value={pw.confirm}
                onChange={(e) => setPw(p => ({ ...p, confirm: e.target.value }))}
                className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white/90 focus:border-white/[0.15] focus:outline-none transition-colors"
              />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="ghost" onClick={() => { setShowPw(false); setPw({ current: "", new: "", confirm: "" }); }}>Batal</Button>
              <Button onClick={handleChangePassword} disabled={pending}>
                {pending ? "Menyimpan..." : "Ubah Password"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
