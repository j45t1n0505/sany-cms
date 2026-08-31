import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X, Trash2 } from "lucide-react";
import api, { formatApiError, formatIDR } from "../lib/api";
import { PageHeader } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../context/AuthContext";

const statusColor = { draft: "bg-neutral-100 text-neutral-600", sent: "bg-amber-50 text-amber-700", accepted: "bg-emerald-50 text-emerald-700", rejected: "bg-rose-50 text-rose-700" };

export default function Quotations() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("sales_manager");
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [units, setUnits] = useState([]);
  const [spareparts, setSpareparts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ client_id: "", notes: "", lines: [] });

  const load = async () => {
    const [q, c, u, s] = await Promise.all([api.get("/quotations"), api.get("/clients"), api.get("/units"), api.get("/spareparts")]);
    setItems(q.data); setClients(c.data); setUnits(u.data); setSpareparts(s.data);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm({ client_id: "", notes: "", lines: [] }); setOpen(true); };
  const addLine = (type) => {
    setForm((f) => ({ ...f, lines: [...f.lines, { item_type: type, item_id: "", description: "", quantity: 1, unit_price: 0 }] }));
  };
  const setLine = (idx, key, val) => {
    setForm((f) => {
      const lines = [...f.lines]; lines[idx] = { ...lines[idx], [key]: val };
      if (key === "item_id") {
        const src = lines[idx].item_type === "unit" ? units : spareparts;
        const found = src.find((x) => x.id === val);
        if (found) {
          lines[idx].description = found.name;
          lines[idx].unit_price = lines[idx].item_type === "unit" ? found.price : found.unit_price;
        }
      }
      return { ...f, lines };
    });
  };
  const removeLine = (idx) => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));

  const subtotal = form.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0);
  const tax = subtotal * 0.11;
  const total = subtotal + tax;

  const save = async () => {
    if (!form.client_id || form.lines.length === 0) { toast.error("Lengkapi klien dan minimal 1 baris"); return; }
    try {
      await api.post("/quotations", form);
      toast.success("Quotation dibuat"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const setStatus = async (q, status) => {
    try { await api.put(`/quotations/${q.id}/status`, null, { params: { status } }); toast.success("Status diperbarui"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c.company]));

  return (
    <div>
      <PageHeader eyebrow="/ Quotation" title="Penawaran Harga" description="Kelola quotation, revenue pipeline, dan status penawaran."
        actions={canEdit && (
          <Button onClick={openNew} data-testid="add-quote-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" /> Quotation Baru
          </Button>
        )}
      />

      <div className="bg-white border border-neutral-200">
        <Table>
          <TableHeader><TableRow><TableHead>No.</TableHead><TableHead>Tanggal</TableHead><TableHead>Klien</TableHead><TableHead>Line</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((q) => (
              <TableRow key={q.id} data-testid={`quote-row-${q.id}`}>
                <TableCell className="font-mono text-xs">{q.quote_no}</TableCell>
                <TableCell className="font-mono text-xs">{q.created_at.slice(0, 10)}</TableCell>
                <TableCell>{clientMap[q.client_id] || "-"}</TableCell>
                <TableCell>{q.lines.length}</TableCell>
                <TableCell className="font-display font-bold">{formatIDR(q.total)}</TableCell>
                <TableCell><span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 ${statusColor[q.status]}`}>{q.status}</span></TableCell>
                <TableCell className="text-right">
                  {canEdit && (
                    <Select value={q.status} onValueChange={(v) => setStatus(q, v)}>
                      <SelectTrigger className="rounded-none h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{["draft", "sent", "accepted", "rejected"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
              <div><div className="font-mono text-[10px] uppercase tracking-widest text-[#E60012]">/ Quotation</div><div className="font-display font-black text-2xl">Buat Penawaran</div></div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="rounded-none" data-testid="quote-client-select"><SelectValue placeholder="Pilih klien" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>)}</SelectContent>
              </Select>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => addLine("unit")} className="rounded-none">+ Unit</Button>
                <Button size="sm" variant="outline" onClick={() => addLine("sparepart")} className="rounded-none">+ Sparepart</Button>
                <Button size="sm" variant="outline" onClick={() => addLine("rental")} className="rounded-none">+ Rental</Button>
              </div>

              {form.lines.map((l, i) => (
                <div key={i} className="border border-neutral-200 p-3 grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">{l.item_type}</div>
                  {(l.item_type === "unit" || l.item_type === "sparepart") ? (
                    <Select value={l.item_id} onValueChange={(v) => setLine(i, "item_id", v)}>
                      <SelectTrigger className="rounded-none col-span-4 h-9"><SelectValue placeholder="Pilih item" /></SelectTrigger>
                      <SelectContent>
                        {(l.item_type === "unit" ? units : spareparts).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} placeholder="Deskripsi" className="col-span-4 rounded-none h-9" />
                  )}
                  <Input type="number" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} className="col-span-2 rounded-none h-9" placeholder="Qty" />
                  <Input type="number" value={l.unit_price} onChange={(e) => setLine(i, "unit_price", e.target.value)} className="col-span-3 rounded-none h-9" placeholder="Harga" />
                  <div className="col-span-1 text-right"><button onClick={() => removeLine(i)}><Trash2 className="w-4 h-4 text-rose-600" /></button></div>
                </div>
              ))}

              <div className="border-t pt-4 text-sm space-y-1 font-mono">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatIDR(subtotal)}</span></div>
                <div className="flex justify-between text-neutral-500"><span>PPN 11%</span><span>{formatIDR(tax)}</span></div>
                <div className="flex justify-between font-display font-black text-2xl border-t pt-2 mt-2"><span>Total</span><span>{formatIDR(total)}</span></div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>
              <Button onClick={save} data-testid="save-quote-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Simpan Quotation</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
