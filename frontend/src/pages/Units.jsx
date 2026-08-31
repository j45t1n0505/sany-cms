import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import api, { formatApiError, formatIDR } from "../lib/api";
import { PageHeader } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useAuth } from "../context/AuthContext";

const CATS = ["Excavator", "Drilling Rig", "Wheel Loader"];
const SUBCATS = {
  "Excavator": ["Small Excavator", "Medium Excavator", "Large / Mining Excavator", "Electric Excavator"],
  "Drilling Rig": ["Drilling Rig"],
  "Wheel Loader": ["Wheel Loader"],
};
const STATUSES = ["available", "rented", "sold", "maintenance"];

const empty = () => ({ name: "", category: "Excavator", subcategory: "Small Excavator", model_code: "", year: 2026, price: 0, status: "available", description: "", specs: {}, images: [] });

export default function Units() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("sales_manager");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty());
  const [specsText, setSpecsText] = useState("");
  const [imgText, setImgText] = useState("");

  const load = () => api.get("/units").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null); setForm(empty()); setSpecsText(""); setImgText(""); setOpen(true);
  };
  const openEdit = (u) => {
    setEditing(u.id); setForm({ ...u });
    setSpecsText(Object.entries(u.specs || {}).map(([k, v]) => `${k}: ${v}`).join("\n"));
    setImgText((u.images || []).join("\n"));
    setOpen(true);
  };
  const save = async () => {
    const specs = {};
    specsText.split("\n").forEach((l) => {
      const [k, ...rest] = l.split(":");
      if (k && rest.length) specs[k.trim()] = rest.join(":").trim();
    });
    const images = imgText.split("\n").map((s) => s.trim()).filter(Boolean);
    const payload = { ...form, price: Number(form.price), year: Number(form.year), specs, images };
    try {
      if (editing) await api.put(`/units/${editing}`, payload); else await api.post("/units", payload);
      toast.success(editing ? "Unit diperbarui" : "Unit ditambahkan");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const remove = async (u) => {
    if (!window.confirm(`Hapus unit ${u.name}?`)) return;
    try { await api.delete(`/units/${u.id}`); toast.success("Terhapus"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader
        eyebrow="/ Katalog Unit"
        title="Manajemen Alat Berat"
        description="CRUD katalog unit dengan spesifikasi teknis, galeri, dan status ketersediaan."
        actions={canEdit && (
          <Button onClick={openNew} data-testid="add-unit-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" /> Tambah Unit
          </Button>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((u) => (
          <div key={u.id} data-testid={`unit-card-${u.id}`} className="bg-white border border-neutral-200 overflow-hidden group hover:border-[#E60012] transition-colors">
            <div className="aspect-[16/10] bg-neutral-100 overflow-hidden">
              {u.images?.[0] ? (
                <img src={u.images[0]} alt={u.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : <div className="w-full h-full grid place-items-center font-mono text-xs text-neutral-400">NO IMAGE</div>}
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] tracking-widest uppercase text-neutral-500">{u.category}{u.subcategory ? ` · ${u.subcategory}` : ""} · {u.model_code}</span>
                <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 ${
                  u.status === "available" ? "bg-emerald-50 text-emerald-700" :
                  u.status === "rented" ? "bg-amber-50 text-amber-700" :
                  u.status === "sold" ? "bg-neutral-100 text-neutral-500" :
                  "bg-rose-50 text-rose-700"
                }`}>{u.status}</span>
              </div>
              <h3 className="font-display font-bold text-lg tracking-tight">{u.name}</h3>
              <div className="mt-2 font-display font-black text-xl">{formatIDR(u.price)}</div>
              <div className="mt-3 flex flex-wrap gap-1 text-[10px] font-mono text-neutral-500">
                {Object.entries(u.specs || {}).slice(0, 3).map(([k, v]) => (
                  <span key={k} className="border border-neutral-200 px-2 py-0.5">{k}: {v}</span>
                ))}
              </div>
              {canEdit && (
                <div className="mt-4 flex gap-2 pt-4 border-t border-neutral-100">
                  <Button size="sm" variant="outline" onClick={() => openEdit(u)} data-testid={`edit-unit-${u.id}`} className="rounded-none flex-1 h-9 font-mono text-[10px] uppercase tracking-widest">
                    <Pencil className="w-3 h-3 mr-2" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => remove(u)} data-testid={`delete-unit-${u.id}`} className="rounded-none h-9 border-rose-200 text-rose-600 hover:bg-rose-50">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200 sticky top-0 bg-white">
              <div>
                <div className="font-mono text-[10px] tracking-widest uppercase text-[#E60012]">/ {editing ? "Edit" : "New"}</div>
                <div className="font-display font-black text-2xl tracking-tight">{editing ? "Edit Unit" : "Tambah Unit"}</div>
              </div>
              <button onClick={() => setOpen(false)} data-testid="close-unit-modal"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <Input placeholder="Nama unit" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="unit-name-input" className="rounded-none" />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, subcategory: (SUBCATS[v] || [])[0] || "" })}>
                  <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.subcategory || ""} onValueChange={(v) => setForm({ ...form, subcategory: v })}>
                  <SelectTrigger className="rounded-none" data-testid="unit-subcategory-select"><SelectValue placeholder="Subkategori" /></SelectTrigger>
                  <SelectContent>{(SUBCATS[form.category] || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input placeholder="Model code (mis: SY215C)" value={form.model_code} onChange={(e) => setForm({ ...form, model_code: e.target.value })} data-testid="unit-model-input" className="rounded-none" />
              <div className="grid grid-cols-3 gap-3">
                <Input type="number" placeholder="Tahun" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="rounded-none" />
                <Input type="number" placeholder="Harga (IDR)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="unit-price-input" className="rounded-none" />
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Textarea placeholder="Deskripsi" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-none" />
              <div>
                <div className="font-mono text-[10px] tracking-widest uppercase text-neutral-500 mb-1">Spesifikasi (satu per baris — kunci: nilai)</div>
                <Textarea value={specsText} onChange={(e) => setSpecsText(e.target.value)} placeholder="operating_weight: 21500 kg&#10;power: 129 kW" className="rounded-none font-mono text-xs" rows={5} />
              </div>
              <div>
                <div className="font-mono text-[10px] tracking-widest uppercase text-neutral-500 mb-1">URL Galeri Foto (satu per baris)</div>
                <Textarea value={imgText} onChange={(e) => setImgText(e.target.value)} placeholder="https://..." className="rounded-none font-mono text-xs" rows={3} />
              </div>
            </div>
            <div className="p-6 border-t border-neutral-200 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>
              <Button onClick={save} data-testid="save-unit-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Simpan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
