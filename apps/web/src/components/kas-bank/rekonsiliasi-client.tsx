"use client";

import { useState, useTransition, useMemo } from "react";
import { Button, Card, Badge, Alert } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileUp,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Search,
  Banknote,
  ArrowRightLeft,
  X,
} from "lucide-react";
import { reconcileBankTransactions, getUnreconciledTransactions, type BankStatementRow, type MatchResult } from "@/lib/actions/reconcile";
import type { BankAccountRow, BankTransactionRow } from "@/lib/queries";

type State = "setup" | "preview" | "result";

interface Props {
  bankAccounts: BankAccountRow[];
}

export function RekonsiliasiClient({ bankAccounts }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<State>("setup");
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [statementRows, setStatementRows] = useState<BankStatementRow[]>([]);
  const [internalTx, setInternalTx] = useState<BankTransactionRow[]>([]);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [result, setResult] = useState<{ success: number; error?: string } | null>(null);

  const selectedBank = useMemo(() => bankAccounts.find(b => b.id === selectedBankId), [bankAccounts, selectedBankId]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedBankId) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result;
      if (!data) return;

      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]!];
        const rows = XLSX.utils.sheet_to_json(ws!) as any[];

        if (rows.length === 0) {
          toast.push("File kosong", "error");
          return;
        }

        // Logic parser BCA / Mandiri simple
        // BCA usually: Tgl, Keterangan, Cabang, Jumlah, Saldo
        // Mandiri usually: Tanggal, Keterangan, Debet, Kredit, Saldo
        const mapped: BankStatementRow[] = rows.map((r) => {
          const date = r.Tanggal || r.Tgl || r.Date || "";
          const desc = r.Keterangan || r.Description || r.Memo || "";
          const debit = Number(r.Debet || r.Debit || 0);
          const credit = Number(r.Kredit || r.Credit || 0);
          
          // BCA format typically has one 'Jumlah' column with DB/CR indicator or sign
          let amount = debit || credit || Number(r.Jumlah || r.Amount || 0);
          let type: "debit" | "credit" = credit > 0 || (r.Type === "CR") ? "credit" : "debit";
          
          if (r.Jumlah && String(r.Jumlah).includes("DB")) {
             type = "debit";
             amount = Number(String(r.Jumlah).replace("DB", "").trim());
          } else if (r.Jumlah && String(r.Jumlah).includes("CR")) {
             type = "credit";
             amount = Number(String(r.Jumlah).replace("CR", "").trim());
          }

          return {
            date: String(date),
            description: String(desc),
            type,
            amount: Math.abs(amount),
          };
        }).filter(r => r.amount > 0);

        setStatementRows(mapped);

        // Fetch internal transactions
        const tx = await getUnreconciledTransactions(selectedBankId);
        setInternalTx(tx as any);

        // Auto-match logic
        const autoMatches: MatchResult[] = [];
        const usedTx = new Set<string>();

        mapped.forEach((sr, sIdx) => {
           // Find exact amount + type match
           const match = tx.find(it => 
              !usedTx.has(it.id) && 
              Math.abs(Number(it.amount)) === sr.amount && 
              it.type === sr.type
           );
           
           if (match) {
              autoMatches.push({
                 statement_row_idx: sIdx,
                 transaction_id: match.id,
                 confidence: "exact"
              });
              usedTx.add(match.id);
           }
        });

        setMatches(autoMatches);
        setState("preview");
      } catch (err) {
        toast.push("Gagal membaca file", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleConfirm() {
    if (!selectedBankId) return;
    startTransition(async () => {
      const r = await reconcileBankTransactions(selectedBankId, matches);
      if (r.error) {
        setResult({ success: 0, error: r.error });
      } else {
        setResult({ success: r.count || 0 });
        toast.push(`${r.count} transaksi direkonsiliasi`, "success");
      }
      setState("result");
    });
  }

  function toggleMatch(sIdx: number, txId: string) {
    const existing = matches.find(m => m.statement_row_idx === sIdx);
    if (existing) {
       if (existing.transaction_id === txId) {
          setMatches(matches.filter(m => m.statement_row_idx !== sIdx));
       } else {
          setMatches(matches.map(m => m.statement_row_idx === sIdx ? { ...m, transaction_id: txId } : m));
       }
    } else {
       setMatches([...matches, { statement_row_idx: sIdx, transaction_id: txId, confidence: "partial" }]);
    }
  }

  return (
    <div className="space-y-6">
      {state === "setup" && (
        <Card className="max-w-xl mx-auto p-8 text-center space-y-6">
           <div className="rounded-full bg-white/5 w-16 h-16 flex items-center justify-center mx-auto text-white/40">
              <Banknote size={32} />
           </div>
           <div>
              <h2 className="text-xl font-bold text-white">Mulai Rekonsiliasi</h2>
              <p className="text-sm text-white/50 mt-1">
                 Pilih akun bank dan upload file mutasi (Excel/CSV) untuk dicocokkan.
              </p>
           </div>

           <div className="space-y-4 text-left">
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-white/40 uppercase">Pilih Akun Bank</label>
                 <select 
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    className="w-full bg-[#1F1F1E] border border-white/[0.08] rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none"
                 >
                    <option value="">-- Pilih Akun --</option>
                    {bankAccounts.filter(b => b.type !== 'cash').map(b => (
                       <option key={b.id} value={b.id}>{b.name} (Rp {b.current_balance.toLocaleString()})</option>
                    ))}
                 </select>
              </div>

              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl transition-all cursor-pointer ${selectedBankId ? 'border-white/10 hover:border-white/20 bg-white/[0.02]' : 'border-white/5 opacity-50 cursor-not-allowed'}`}>
                 <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-3 text-white/30" />
                    <p className="text-sm text-white/50">
                       <span className="font-semibold text-white/70">Klik untuk upload</span> mutasi bank
                    </p>
                    <p className="text-xs text-white/30 mt-1">XLSX, XLS, atau CSV</p>
                 </div>
                 <input 
                    type="file" 
                    className="hidden" 
                    accept=".xlsx,.xls,.csv" 
                    onChange={handleFile}
                    disabled={!selectedBankId}
                 />
              </label>
           </div>
        </Card>
      )}

      {state === "preview" && (
        <div className="space-y-6">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <Button variant="ghost" size="sm" onClick={() => setState("setup")}>
                    <X size={16} className="mr-2" /> Kembali
                 </Button>
                 <h2 className="text-xl font-bold text-white">Preview Rekonsiliasi</h2>
                 <Badge tone="info">{selectedBank?.name}</Badge>
              </div>
              <Button onClick={handleConfirm} disabled={pending || matches.length === 0}>
                 {pending ? "Memproses..." : `Konfirmasi ${matches.length} Kecocokan`}
                 <ChevronRight size={16} className="ml-2" />
              </Button>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                 <h3 className="text-xs font-semibold text-white/40 uppercase px-1 tracking-wider">File Mutasi Bank ({statementRows.length})</h3>
                 <div className="space-y-2">
                    {statementRows.map((sr, sIdx) => {
                       const match = matches.find(m => m.statement_row_idx === sIdx);
                       const it = match ? internalTx.find(t => t.id === match.transaction_id) : null;

                       return (
                          <Card key={sIdx} className={`p-4 border-white/[0.04] ${match ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-[#262626]'}`}>
                             <div className="flex justify-between items-start">
                                <div>
                                   <div className="flex items-center gap-2">
                                      <span className="text-xs text-white/40 font-mono">{sr.date}</span>
                                      <Badge tone={sr.type === 'credit' ? 'success' : 'danger'} className="text-[10px] scale-90">
                                         {sr.type === 'credit' ? 'CR' : 'DB'}
                                      </Badge>
                                   </div>
                                   <div className="text-xs text-white/70 mt-1 line-clamp-1">{sr.description}</div>
                                   <div className="text-sm font-bold text-white mt-1">Rp {sr.amount.toLocaleString()}</div>
                                </div>
                                
                                {match ? (
                                   <div className="text-right">
                                      <Badge tone="success" className="mb-2">Matched</Badge>
                                      <div className="text-[10px] text-white/30 truncate max-w-[150px]">
                                         Internal: {it?.description}
                                      </div>
                                   </div>
                                ) : (
                                   <div className="text-right">
                                      <Badge tone="neutral">Unmatched</Badge>
                                   </div>
                                )}
                             </div>
                          </Card>
                       );
                    })}
                 </div>
              </div>

              <div className="space-y-3">
                 <h3 className="text-xs font-semibold text-white/40 uppercase px-1 tracking-wider">Transaksi Internal Belum Rekonsiliasi ({internalTx.length})</h3>
                 <div className="space-y-2">
                    {internalTx.map((it) => {
                       const isMatched = matches.some(m => m.transaction_id === it.id);
                       const srIdx = matches.find(m => m.transaction_id === it.id)?.statement_row_idx;

                       return (
                          <Card 
                             key={it.id} 
                             className={`p-4 border-white/[0.04] transition-all ${isMatched ? 'opacity-40 scale-[0.98] border-emerald-500/20' : 'bg-[#262626] hover:bg-[#2a2a2a]'}`}
                          >
                             <div className="flex justify-between items-center">
                                <div>
                                   <div className="flex items-center gap-2 text-xs text-white/40">
                                      <span>{new Date(it.transaction_date).toLocaleDateString()}</span>
                                      <span>•</span>
                                      <span className="uppercase">{it.type}</span>
                                   </div>
                                   <div className="text-xs text-white/80 mt-1 font-medium">{it.description}</div>
                                   <div className="text-sm font-bold text-white">Rp {Math.abs(it.amount).toLocaleString()}</div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                   {isMatched ? (
                                      <div className="text-[10px] text-emerald-400 font-medium">Matched to row {srIdx! + 1}</div>
                                   ) : (
                                      <Button 
                                         variant="ghost" 
                                         size="sm" 
                                         className="h-7 text-[10px]"
                                         onClick={() => {
                                            // Quick match if there's an unmatched row with same amount
                                            const openRowIdx = statementRows.findIndex((sr, idx) => 
                                               !matches.some(m => m.statement_row_idx === idx) && 
                                               sr.amount === Math.abs(it.amount) && 
                                               sr.type === it.type
                                            );
                                            if (openRowIdx !== -1) {
                                               toggleMatch(openRowIdx, it.id);
                                            } else {
                                               toast.push("Tidak ada baris mutasi dengan jumlah yang sama", "info");
                                            }
                                         }}
                                      >
                                         <ArrowRightLeft size={12} className="mr-1" /> Cocokkan
                                      </Button>
                                   )}
                                </div>
                             </div>
                          </Card>
                       );
                    })}
                    {internalTx.length === 0 && (
                       <div className="p-12 text-center text-white/20 text-sm">
                          Semua transaksi internal sudah direkonsiliasi.
                       </div>
                    )}
                 </div>
              </div>
           </div>
        </div>
      )}

      {state === "result" && result && (
        <Card className="max-w-xl mx-auto p-12 text-center space-y-6 border-white/[0.06]">
           <div className={`rounded-full w-20 h-20 flex items-center justify-center mx-auto ${result.error ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
              {result.error ? <AlertCircle size={40} /> : <CheckCircle2 size={40} />}
           </div>
           
           <div>
              <h2 className="text-2xl font-bold text-white">
                 {result.error ? "Rekonsiliasi Gagal" : "Rekonsiliasi Selesai"}
              </h2>
              <p className="text-white/50 mt-2">
                 {result.error ? result.error : `${result.success} transaksi telah ditandai sebagai 'Cocok' dengan rekening koran.`}
              </p>
           </div>

           <div className="pt-4 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setState("setup")}>
                 Mulai Lagi
              </Button>
              <Button className="flex-1" onClick={() => router.push("/kas-bank/mutasi")}>
                 Lihat Mutasi
              </Button>
           </div>
        </Card>
      )}
    </div>
  );
}
