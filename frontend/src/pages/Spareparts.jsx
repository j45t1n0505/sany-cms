import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X, ArrowUp, ArrowDown, Pencil, Trash2 } from "lucide-react";
import api, { formatApiError, formatIDR } from "../lib/api";
import { PageHeader, StatCard } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../context/AuthContext";

const empty = () => ({ sku: "", name: "", category: "Filter", unit_price: 0, stock: 0, min_stock: 0, location: "" });

export default function Spareparts() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("warehouse_staff", "sales_manager");
  const [items, setItems] = useState([]);
  const [moves, setMoves] = useState([]);
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty());
  const [move, setMove] = useState({ change: 0, reason: "", reference: "" });

  const load = async () => {
    const [a, b] = await Promise.all([api.get("/spareparts"), api.get("/spareparts/moves")]);
    setItems(a.data); setMoves(b.data);
  };
  useEffect(() => { load(); }, []);

  const totalValue = items.reduce((s, i) => s + i.stock * i.unit_price, 0);
  const lowStock = items.filter((i) => i.stock <= i.min_stock).length;

  const openNew = () => { setEditing(null); setForm(empty()); setOpen(true); };
  const openEdit = (s) => { setEditing(s.id); setForm({ ...s }); setOpen(true); };
  const save = async () => {
    const payload = { ...form, unit_price: Number(form.unit_price), stock: Number(form.stock), min_stock: Number(form.min_stock) };
    try {
      if (editing) await api.put(`/spareparts/${editing}`, payload);
      else await api.post("/spareparts", payload);
      toast.success("Tersimpan"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const doMove = async (sign) => {
    try {
      await api.post("/spareparts/move", { sparepart_id: moveOpen.id, change: sign * Number(move.change), reason: move.reason, reference: move.reference });
      toast.success("Stok diperbarui"); setMoveOpen(null); setMove({ change: 0, reason: "", reference: "" }); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Hapus ${s.name}?`)) return;
    try { await api.delete(`/spareparts/${s.id}`); toast.success("Terhapus"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader eyebrow="/ Suku Cadang" title="Inventaris & Stok" description="Pelacakan real-time, alert stok minimum, dan riwayat mutasi barang."
        actions={canEdit && (
          <Button onClick={openNew} data-testid="add-sparepart-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" /> Tambah SKU
          </Button>
        )}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard accent label="Total SKU" value={items.length} />
        <StatCard label="Nilai Inventaris" value={formatIDR(totalValue)} />
        <StatCard label="Stok Menipis" value={lowStock} sub="Perlu restock" />
        <StatCard label="Mutasi 7 Hari" value={moves.length} />
      </div>

      <div className="bg-white border border-neutral-200">
        <div className="p-4 border-b border-neutral-200 font-mono text-[10px] tracking-widest uppercase text-neutral-500">Katalog Sparepart</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead><TableHead>Nama</TableHead><TableHead>Kategori</TableHead>
              <TableHead>Harga</TableHead><TableHead>Stok</TableHead><TableHead>Min</TableHead>
              <TableHead>Lokasi</TableHead><TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((s) => (
              <TableRow key={s.id} data-testid={`sparepart-row-${s.id}`}>
                <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.category}</TableCell>
                <TableCell>{formatIDR(s.unit_price)}</TableCell>
                <TableCell>
                  <span className={`font-mono px-2 py-0.5 text-xs ${s.stock <= s.min_stock ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{s.stock}</span>
                </TableCell>
                <TableCell className="font-mono text-xs">{s.min_stock}</TableCell>
                <TableCell className="font-mono text-xs">{s.location}</TableCell>
                <TableCell className="text-right">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setMoveOpen(s)} data-testid={`move-stock-${s.id}`} className="rounded-none h-8 text-[10px] font-mono uppercase">Mutasi</Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)} className="rounded-none h-8"><Pencil className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s)} className="rounded-none h-8 text-rose-600"><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-8 bg-white border border-neutral-200">
        <div className="p-4 border-b border-neutral-200 font-mono text-[10px] tracking-widest uppercase text-neutral-500">Riwayat Mutasi</div>
        {moves.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">Belum ada mutasi.</div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Sparepart</TableHead><TableHead>Perubahan</TableHead><TableHead>Alasan</TableHead><TableHead>Referensi</TableHead><TableHead>User</TableHead></TableRow></TableHeader>
            <TableBody>
              {moves.slice(0, 15).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.created_at.slice(0, 16).replace("T", " ")}</TableCell>
                  <TableCell>{m.sparepart_name}</TableCell>
                  <TableCell className={m.change > 0 ? "text-emerald-700" : "text-rose-700"}>{m.change > 0 ? "+" : ""}{m.change}</TableCell>
                  <TableCell>{m.reason}</TableCell>
                  <TableCell className="font-mono text-xs">{m.reference}</TableCell>
                  <TableCell className="text-xs">{m.user_name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="font-display font-black text-xl">{editing ? "Edit SKU" : "Tambah SKU"}</div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} data-testid="sp-sku-input" className="rounded-none" />
              <Input placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="sp-name-input" className="rounded-none" />
              <Input placeholder="Kategori" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-none" />
              <div className="grid grid-cols-3 gap-3">
                <Input type="number" placeholder="Harga" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} className="rounded-none" />
                <Input type="number" placeholder="Stok" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="rounded-none" />
                <Input type="number" placeholder="Min Stok" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} className="rounded-none" />
              </div>
              <Input placeholder="Lokasi rak" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="rounded-none" />
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>
              <Button onClick={save} data-testid="save-sp-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Simpan</Button>
            </div>
          </div>
        </div>
      )}

      {moveOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <div><div className="font-mono text-[10px] uppercase tracking-widest text-[#E60012]">/ Mutasi Stok</div><div className="font-display font-black text-xl">{moveOpen.name}</div><div className="text-xs text-neutral-500 mt-1">Stok saat ini: {moveOpen.stock}</div></div>
              <button onClick={() => setMoveOpen(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Input type="number" placeholder="Jumlah" value={move.change} onChange={(e) => setMove({ ...move, change: e.target.value })} data-testid="move-qty-input" className="rounded-none" />
              <Input placeholder="Alasan (contoh: penjualan, service, restock)" value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} className="rounded-none" />
              <Input placeholder="Referensi (PO / SO / nota)" value={move.reference} onChange={(e) => setMove({ ...move, reference: e.target.value })} className="rounded-none" />
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => doMove(-1)} data-testid="move-out-btn" className="rounded-none border-rose-300 text-rose-700"><ArrowDown className="w-3 h-3 mr-2" /> Keluar</Button>
              <Button onClick={() => doMove(1)} data-testid="move-in-btn" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-none"><ArrowUp className="w-3 h-3 mr-2" /> Masuk</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
