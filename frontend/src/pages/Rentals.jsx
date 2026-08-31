import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import api, { formatApiError, formatIDR } from "../lib/api";
import { PageHeader } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../context/AuthContext";

const statusColor = { scheduled: "bg-blue-50 text-blue-700", active: "bg-emerald-50 text-emerald-700", completed: "bg-neutral-100 text-neutral-600", cancelled: "bg-rose-50 text-rose-700" };

export default function Rentals() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("sales_manager");
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ unit_id: "", client_id: "", start_date: "", end_date: "", daily_rate: 0, status: "scheduled", notes: "" });

  const load = async () => {
    const [r, u, c] = await Promise.all([api.get("/rentals"), api.get("/units"), api.get("/clients")]);
    setItems(r.data); setUnits(u.data); setClients(c.data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.unit_id || !form.client_id || !form.start_date || !form.end_date) { toast.error("Lengkapi field"); return; }
    try {
      await api.post("/rentals", { ...form, daily_rate: Number(form.daily_rate) });
      toast.success("Rental dibuat"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const setStatus = async (r, status) => {
    try { await api.put(`/rentals/${r.id}/status`, null, { params: { status } }); toast.success("Status diperbarui"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader eyebrow="/ Rental" title="Penyewaan Unit" description="Kontrak sewa alat berat dengan jadwal, tarif harian, dan tagihan."
        actions={canEdit && (
          <Button onClick={() => setOpen(true)} data-testid="add-rental-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" /> Kontrak Baru
          </Button>
        )}
      />

      <div className="bg-white border border-neutral-200">
        <Table>
          <TableHeader><TableRow><TableHead>No.</TableHead><TableHead>Unit</TableHead><TableHead>Klien</TableHead><TableHead>Mulai</TableHead><TableHead>Selesai</TableHead><TableHead>Hari</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id} data-testid={`rental-row-${r.id}`}>
                <TableCell className="font-mono text-xs">{r.rental_no}</TableCell>
                <TableCell>{r.unit_name}</TableCell>
                <TableCell>{r.client_name}</TableCell>
                <TableCell className="font-mono text-xs">{r.start_date.slice(0, 10)}</TableCell>
                <TableCell className="font-mono text-xs">{r.end_date.slice(0, 10)}</TableCell>
                <TableCell className="font-mono">{r.days}</TableCell>
                <TableCell className="font-display font-bold">{formatIDR(r.total_amount)}</TableCell>
                <TableCell>
                  {canEdit ? (
                    <Select value={r.status} onValueChange={(v) => setStatus(r, v)}>
                      <SelectTrigger className="rounded-none h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{["scheduled", "active", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 ${statusColor[r.status]}`}>{r.status}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="font-display font-black text-xl">Kontrak Rental Baru</div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}>
                <SelectTrigger className="rounded-none" data-testid="rental-unit-select"><SelectValue placeholder="Pilih Unit" /></SelectTrigger>
                <SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="rounded-none" data-testid="rental-client-select"><SelectValue placeholder="Pilih Klien" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>)}</SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={form.start_date.slice(0, 10)} onChange={(e) => setForm({ ...form, start_date: e.target.value })} data-testid="rental-start-input" className="rounded-none" />
                <Input type="date" value={form.end_date.slice(0, 10)} onChange={(e) => setForm({ ...form, end_date: e.target.value })} data-testid="rental-end-input" className="rounded-none" />
              </div>
              <Input type="number" placeholder="Tarif harian (IDR)" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} className="rounded-none" />
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent>{["scheduled", "active", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Textarea placeholder="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-none" />
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>
              <Button onClick={save} data-testid="save-rental-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Simpan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
