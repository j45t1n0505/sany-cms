import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X, Pencil, Trash2, MessageSquare } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { PageHeader } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useAuth } from "../context/AuthContext";

const empty = () => ({ company: "", contact_name: "", email: "", phone: "", address: "", industry: "", notes: "" });

export default function CRM() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("sales_manager");
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty());
  const [intForm, setIntForm] = useState({ kind: "call", summary: "" });

  const load = () => api.get("/clients").then((r) => setClients(r.data));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (selected) api.get("/interactions", { params: { client_id: selected.id } }).then((r) => setInteractions(r.data));
  }, [selected]);

  const openNew = () => { setEditing(null); setForm(empty()); setOpen(true); };
  const openEdit = (c) => { setEditing(c.id); setForm({ ...c }); setOpen(true); };
  const save = async () => {
    try {
      if (editing) await api.put(`/clients/${editing}`, form); else await api.post("/clients", form);
      toast.success("Tersimpan"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const remove = async (c) => {
    if (!window.confirm(`Hapus ${c.company}?`)) return;
    try { await api.delete(`/clients/${c.id}`); toast.success("Terhapus"); setSelected(null); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const addInt = async () => {
    if (!intForm.summary) return;
    try {
      await api.post("/interactions", { client_id: selected.id, ...intForm });
      setIntForm({ kind: "call", summary: "" });
      const r = await api.get("/interactions", { params: { client_id: selected.id } });
      setInteractions(r.data); toast.success("Interaksi dicatat");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader eyebrow="/ CRM" title="Manajemen Prospek & Klien" description="Data klien, riwayat interaksi penjualan, dan komunikasi."
        actions={canEdit && (
          <Button onClick={openNew} data-testid="add-client-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" /> Tambah Klien
          </Button>
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-2 max-h-[75vh] overflow-y-auto">
          {clients.map((c) => (
            <div key={c.id} onClick={() => setSelected(c)} data-testid={`client-${c.id}`}
              className={`p-4 bg-white border cursor-pointer hover:border-[#E60012] transition-colors ${selected?.id === c.id ? "border-[#E60012]" : "border-neutral-200"}`}>
              <div className="font-display font-bold">{c.company}</div>
              <div className="text-xs text-neutral-500">{c.contact_name}</div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-400">{c.industry}</div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2">
          {!selected ? (
            <div className="border border-dashed border-neutral-300 p-16 text-center text-neutral-500">Pilih klien untuk melihat detail.</div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white border border-neutral-200 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[#E60012] mb-1">{selected.industry}</div>
                    <div className="font-display font-black text-3xl tracking-tight">{selected.company}</div>
                    <div className="mt-1 text-neutral-500">{selected.contact_name}</div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => openEdit(selected)} className="rounded-none"><Pencil className="w-3 h-3" /></Button>
                      <Button variant="outline" onClick={() => remove(selected)} className="rounded-none border-rose-200 text-rose-600"><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 mt-6 border-t pt-4 text-sm">
                  <div><div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-1">Email</div>{selected.email || "-"}</div>
                  <div><div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-1">Telepon</div>{selected.phone || "-"}</div>
                  <div className="col-span-2"><div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-1">Alamat</div>{selected.address || "-"}</div>
                  <div className="col-span-2"><div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-1">Catatan</div>{selected.notes || "-"}</div>
                </div>
              </div>

              <div className="bg-white border border-neutral-200 p-6">
                <div className="flex items-center gap-2 mb-4"><MessageSquare className="w-4 h-4 text-[#E60012]" /><div className="font-mono text-[10px] uppercase tracking-widest">Riwayat Interaksi</div></div>
                {canEdit && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4 border-b pb-4">
                    <Select value={intForm.kind} onValueChange={(v) => setIntForm({ ...intForm, kind: v })}>
                      <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                      <SelectContent>{["call", "meeting", "email", "site_visit"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder="Ringkasan..." className="md:col-span-2 rounded-none" value={intForm.summary} onChange={(e) => setIntForm({ ...intForm, summary: e.target.value })} data-testid="interaction-summary" />
                    <Button onClick={addInt} data-testid="add-interaction-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Catat</Button>
                  </div>
                )}
                {interactions.length === 0 ? <div className="text-sm text-neutral-500">Belum ada interaksi.</div> : (
                  <div className="space-y-3">
                    {interactions.map((i) => (
                      <div key={i.id} className="flex gap-4 border-l-2 border-[#E60012] pl-4">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 min-w-[70px]">{i.kind}</div>
                        <div className="flex-1">
                          <div className="text-sm">{i.summary}</div>
                          <div className="font-mono text-[10px] text-neutral-400 mt-1">{i.created_at.slice(0, 16).replace("T", " ")} · {i.user_name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="font-display font-black text-xl">{editing ? "Edit Klien" : "Tambah Klien"}</div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Input placeholder="Nama Perusahaan" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="client-company-input" className="rounded-none" />
              <Input placeholder="Nama Kontak" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="rounded-none" />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-none" />
                <Input placeholder="Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-none" />
              </div>
              <Input placeholder="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-none" />
              <Input placeholder="Industri" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="rounded-none" />
              <Textarea placeholder="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-none" />
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>
              <Button onClick={save} data-testid="save-client-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Simpan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
