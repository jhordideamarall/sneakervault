"use client";

import { useState, useTransition } from "react";
import { createSupplier, updateSupplier, deactivateSupplier } from "@/lib/actions/suppliers";
import { 
  Button, 
  Card, 
  Input, 
} from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { 
  Building2, 
  Plus, 
  Search, 
  Truck, 
  Phone, 
  Mail, 
  User, 
  Edit2,
  Trash2,
  ChevronRight,
} from "lucide-react";

type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
};

export function SuppliersClient({ initialSuppliers }: { initialSuppliers: Supplier[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showForm, setShowShowForm] = useState(false);

  const [form, setForm] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
  });

  const filtered = initialSuppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.contact_person?.toLowerCase().includes(search.toLowerCase())
  );

  function handleSave() {
    if (!form.name) return toast.push("Nama supplier wajib diisi", "error");
    
    startTransition(async () => {
      const res = editing 
        ? await updateSupplier(editing.id, form)
        : await createSupplier(form);

      if ("error" in res && res.error) {
        toast.push(String(res.error), "error");
        return;
      }

      toast.push(`Supplier berhasil ${editing ? 'diperbarui' : 'dibuat'}`, "success");
      reset();
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Nonaktifkan supplier ini?")) return;
    startTransition(async () => {
      const res = await deactivateSupplier(id);
      if (res && "error" in res && res.error) {
        toast.push(String(res.error), "error");
        return;
      }
      toast.push("Supplier dinonaktifkan", "success");
      router.refresh();
    });
  }

  function reset() {
    setEditing(null);
    setShowShowForm(false);
    setForm({ name: "", contact_person: "", phone: "", email: "", address: "" });
  }

  function startEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      contact_person: s.contact_person ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
    });
    setShowShowForm(true);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Building2 className="text-white/40" size={28} />
            Master Supplier
          </h1>
          <Button onClick={() => setShowShowForm(true)} className="bg-white text-black font-bold h-10 shadow-lg shadow-white/5">
            <Plus size={16} className="mr-2" /> Tambah Supplier
          </Button>
        </div>
        <p className="text-white/50 text-sm">
          Kelola daftar mitra pemasok barang untuk verifikasi inbound.
        </p>
      </div>

      <Card className="border-white/[0.06] bg-[#262626] p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
          <input
            type="text"
            placeholder="Cari nama supplier atau kontak person..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <Card key={s.id} className="group relative border-white/[0.06] bg-[#262626] p-5 transition-all hover:border-white/10 hover:bg-[#2a2a2a] shadow-lg">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.05] text-white/40 group-hover:text-emerald-400 group-hover:bg-emerald-500/5 transition-colors">
                <Truck size={24} />
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => startEdit(s)} className="h-8 w-8 p-0 text-white/20 hover:text-white hover:bg-white/5">
                  <Edit2 size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="h-8 w-8 p-0 text-white/20 hover:text-red-400 hover:bg-red-500/5">
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">{s.name}</h3>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-white/40">
                  <User size={12} />
                  {s.contact_person ?? "Tanpa kontak person"}
                </div>
              </div>

              <div className="space-y-2 border-t border-white/[0.04] pt-4">
                <div className="flex items-center gap-3 text-sm text-white/60">
                   <Phone size={14} className="text-white/20" />
                   <span className="font-mono text-xs">{s.phone ?? "—"}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/60">
                   <Mail size={14} className="text-white/20" />
                   <span className="truncate">{s.email ?? "—"}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-5 flex items-center justify-between pt-4 border-t border-white/[0.04]">
               <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Sejak: {new Date(s.created_at).toLocaleDateString("id-ID", { month: 'short', year: 'numeric' })}</span>
               <div className="flex items-center gap-1 text-[10px] font-bold text-sky-400/60 uppercase group-hover:text-sky-400 transition-colors">
                  Detail <ChevronRight size={10} />
               </div>
            </div>
          </Card>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-20">
            <Building2 size={64} />
            <p className="mt-4 text-lg font-medium">Supplier tidak ditemukan</p>
          </div>
        )}
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg border-white/10 bg-[#262626] p-6 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="mb-6 text-xl font-bold text-white flex items-center gap-2">
               {editing ? <Edit2 className="text-sky-400" size={20} /> : <Plus className="text-emerald-400" size={20} />}
               {editing ? "Ubah Supplier" : "Tambah Supplier Baru"}
            </h2>
            
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Nama Perusahaan / Supplier</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: PT. Sepatu Jaya" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Kontak Person</label>
                <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} placeholder="Nama PIC" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider">No. Telepon / WA</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0812..." />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="supplier@mail.com" />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Alamat</label>
                <textarea 
                  value={form.address} 
                  onChange={(e) => setForm({ ...form, address: e.target.value })} 
                  placeholder="Alamat lengkap supplier..."
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 min-h-[80px]"
                />
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <Button variant="ghost" onClick={reset} className="flex-1 h-12">Batal</Button>
              <Button onClick={handleSave} disabled={pending} className="flex-1 h-12 bg-white text-black font-bold">
                {pending ? "Menyimpan..." : "Simpan Supplier"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
