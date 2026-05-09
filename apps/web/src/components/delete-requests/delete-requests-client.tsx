"use client";

import { useState, useTransition } from "react";
import { approveDelete, rejectDelete } from "@/lib/actions/admin";
import { Badge, Button, Card, Input } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";

type Req = {
  id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  review_notes: string | null;
  reviewed_at: string | null;
  profiles?: { full_name: string } | null;
};

const statusTones: Record<string, "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export function DeleteRequestsClient({ requests }: { requests: Req[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<Req | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  function handleApprove(id: string) {
    if (!confirm("Approve penghapusan ini? Tindakan ini tidak dapat dibatalkan.")) return;
    startTransition(async () => {
      const result = await approveDelete(id);
      if ("error" in result && result.error) {
        toast.push(String(result.error), "error");
        return;
      }
      toast.push("Penghapusan disetujui", "success");
      router.refresh();
    });
  }

  function handleReject() {
    if (!rejecting) return;
    if (!rejectNote.trim()) {
      toast.push("Catatan wajib diisi saat menolak", "error");
      return;
    }
    startTransition(async () => {
      const result = await rejectDelete(rejecting.id, rejectNote.trim());
      if ("error" in result && result.error) {
        toast.push(String(result.error), "error");
        return;
      }
      toast.push("Permintaan ditolak", "info");
      setRejecting(null);
      setRejectNote("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1a1a2e]">🗑️ Permintaan Hapus</h1>

      <div className="rounded-xl border border-[#e5e7eb] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#e5e7eb] bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Tanggal</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Oleh</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Jenis</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Alasan</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Status</th>
              <th className="px-4 py-3 text-right font-medium text-[#6b7280]">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7eb]">
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3 text-xs text-[#6b7280] whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-3">{r.profiles?.full_name ?? "—"}</td>
                <td className="px-4 py-3 text-xs">
                  <div>{r.entity_type}</div>
                  <div className="font-mono text-[#9ca3af]">{r.entity_id.slice(0, 8)}...</div>
                </td>
                <td className="px-4 py-3 max-w-xs">{r.reason}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTones[r.status]}>{r.status}</Badge>
                  {r.review_notes && (
                    <p className="mt-1 text-xs text-[#6b7280]">{r.review_notes}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="success" onClick={() => handleApprove(r.id)} disabled={pending}>
                        Approve
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setRejecting(r)} disabled={pending}>
                        Tolak
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">
                  Tidak ada permintaan hapus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <h2 className="mb-2 text-lg font-semibold">Tolak Permintaan</h2>
            <p className="mb-4 text-sm text-[#6b7280]">Jelaskan alasan penolakan:</p>
            <Input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => { setRejecting(null); setRejectNote(""); }}>
                Batal
              </Button>
              <Button variant="danger" onClick={handleReject} disabled={pending}>
                Tolak Permintaan
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
