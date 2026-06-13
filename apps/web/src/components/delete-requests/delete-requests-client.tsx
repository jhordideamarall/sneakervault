"use client";

import { useState, useTransition } from "react";
import { approveDelete, rejectDelete } from "@/lib/actions/admin";
import { Badge, Button, Card } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { DELETE_REQUEST_STATUS_TONES as statusTones } from "@sneakervault/shared";
import {
  Trash2,
  CheckCircle2, 
  XCircle, 
  Calendar, 
  User, 
  AlertCircle,
  MessageSquare,
  Clock,
} from "lucide-react";

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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <Trash2 className="text-white/40" size={28} />
          Permintaan Hapus
        </h1>
        <p className="text-white/50">
          Review permintaan penghapusan data dari admin online atau gudang.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#262626]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Pemohon</th>
                <th className="px-4 py-3 font-medium">Jenis Data</th>
                <th className="px-4 py-3 font-medium">Alasan Hapus</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.01] transition-colors align-top">
                  <td className="px-4 py-4 text-white/50">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Calendar size={12} />
                      {new Date(r.created_at).toLocaleDateString("id-ID", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-white/80">
                      <User size={12} className="text-white/30" />
                      {r.profiles?.full_name ?? "System"}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1">
                       <Badge tone="neutral" className="bg-white/5 border-white/5 uppercase text-[10px] w-fit">
                          {r.entity_type.replace('_', ' ')}
                       </Badge>
                       <span className="font-mono text-[10px] text-white/20">ID: {r.entity_id.slice(0, 8)}...</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="max-w-[300px] text-white/70 italic text-xs leading-relaxed">
                      "{r.reason}"
                    </div>
                    {r.review_notes && (
                      <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-black/20 p-2 text-[10px] text-white/40 border border-white/[0.03]">
                        <MessageSquare size={10} className="mt-0.5" />
                        <span>Review: {r.review_notes}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Badge
                      tone={statusTones[r.status]}
                      className="min-w-[80px] justify-center"
                    >
                      {r.status === "pending" ? (
                        <Clock size={10} className="mr-1" />
                      ) : null}
                      {r.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-right">
                    {r.status === "pending" && (
                      <div className="flex justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="success" 
                          className="h-8 text-[11px]" 
                          onClick={() => handleApprove(r.id)} 
                          disabled={pending}
                        >
                          <CheckCircle2 size={12} className="mr-1.5" /> Setujui
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10" 
                          onClick={() => setRejecting(r)} 
                          disabled={pending}
                        >
                          <XCircle size={12} className="mr-1.5" /> Tolak
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                       <CheckCircle2 size={48} />
                       <p className="text-sm font-medium">Tidak ada permintaan hapus yang perlu di-review.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-white/10 bg-[#262626] p-6 shadow-2xl">
            <h2 className="mb-2 text-xl font-bold text-white flex items-center gap-2">
               <AlertCircle className="text-red-400" size={20} />
               Tolak Permintaan
            </h2>
            <p className="mb-4 text-sm text-white/50">Jelaskan alasan penolakan untuk pemohon:</p>
            <textarea
              className="w-full rounded-xl bg-black/20 border border-white/10 p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 min-h-[100px]"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Contoh: Data ini masih diperlukan untuk rekonsiliasi bulan ini."
            />
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => { setRejecting(null); setRejectNote(""); }}>
                Batal
              </Button>
              <Button variant="danger" onClick={handleReject} disabled={pending || !rejectNote.trim()}>
                Tolak Permintaan
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
