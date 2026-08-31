import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, ShoppingCart, Truck, BadgeCheck, FileDown, X } from "lucide-react";
import api, { formatApiError, formatIDR } from "../lib/api";
import { PageHeader, StatCard, EmptyState } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useAuth } from "../context/AuthContext";

const SHIP = ["ordered", "packed", "shipped", "in_transit", "delivered"];
const SHIP_LABEL = { ordered: "Dipesan", packed: "Dikemas", shipped: "Dikirim", in_transit: "Dalam Perjalanan", delivered: "Diterima" };
const MANUALS = [
  { code: "SY215C", title: "Repair Manual Excavator SY215C", url: "https://www.sanyglobal.com/" },
  { code: "SY365H", title: "Repair Manual Excavator SY365H", url: "https://www.sanyglobal.com/" },
  { code: "SYL956H", title: "Service Manual Wheel Loader SYL956H", url: "https://www.sanyglobal.com/" },
  { code: "SR285MV", title: "Operation Manual Drilling Rig SR285MV", url: "https://www.sanyglobal.com/" },
];

export default function PartsPortal() {
  const { hasRole } = useAuth();
  const canManage = hasRole("warehouse_staff", "sales_manager");
  const [parts, setParts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState({ quantity: 1, client_id: "none", destination: "", notes: "" });

  const load = async () => {
    const [p, o, c] = await Promise.all([
      api.get("/spareparts"), api.get("/part-orders"), api.get("/clients").catch(() => ({ data: [] })),
    ]);
    setParts(p.data); setOrders(o.data); setClients(c.data);
  };
  useEffect(() => { load(); }, []);

  const cats = useMemo(() => ["all", ...new Set(parts.map((p) => p.category))], [parts]);
  const filtered = parts.filter((p) =>
    (cat === "all" || p.category === cat) &&
    (p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase()))
  );

  const estimate = order ? order.unit_price * Number(form.quantity || 0) : 0;

  const submit = async () => {
    if (!form.destination) { toast.error("Isi alamat tujuan pengiriman"); return; }
    try {
      await api.post("/part-orders", {
        sparepart_id: order.id, quantity: Number(form.quantity),
        client_id: form.client_id === "none" ? null : form.client_id,
        destination: form.destination, notes: form.notes,
      });
      toast.success("Pesanan suku cadang dibuat");
      setOrder(null); setForm({ quantity: 1, client_id: "none", destination: "", notes: "" }); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const setStatus = async (o, status) => {
    try { await api.put(`/part-orders/${o.id}/status`, null, { params: { status } }); toast.success("Status pengiriman diperbarui"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="parts-portal-page">
      <PageHeader
        eyebrow="/ Genuine Parts"
        title="Katalog Suku Cadang & Manual"
        description="Cari suku cadang asli SANY, cek estimasi harga, pantau pengiriman komponen, dan unduh buku panduan perbaikan."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Item Katalog" value={parts.length} accent />
        <StatCard label="Pesanan Aktif" value={orders.filter((o) => o.status !== "delivered").length} />
        <StatCard label="Total Pesanan" value={orders.length} />
        <StatCard label="Manual Tersedia" value={MANUALS.length} />
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau SKU suku cadang…"
            data-testid="parts-search" className="rounded-none h-11 pl-9" />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="rounded-none h-11 md:w-56" data-testid="parts-category-select"><SelectValue /></SelectTrigger>
          <SelectContent>{cats.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "Semua kategori" : c}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-12">
        {filtered.map((p) => (
          <div key={p.id} className="bg-white border border-neutral-200 p-5 group hover:border-[#E60012] transition-colors" data-testid={`part-card-${p.id}`}>
            <div className="flex items-start justify-between">
              <div className="font-mono text-[10px] tracking-widest text-neutral-400">{p.sku}</div>
              <span className="font-mono text-[9px] uppercase tracking-widest bg-neutral-950 text-white px-2 py-0.5 flex items-center gap-1">
                <BadgeCheck className="w-3 h-3 text-[#E60012]" /> Genuine
              </span>
            </div>
            <div className="font-display font-black text-lg mt-2 leading-tight">{p.name}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 mt-1">{p.category} · {p.location}</div>
            <div className="font-display font-black text-2xl mt-4">{formatIDR(p.unit_price)}</div>
            <div className="font-mono text-[10px] text-neutral-500 mt-1">
              Stok {p.stock} {p.stock <= p.min_stock && <span className="text-[#E60012]">· stok rendah</span>}
            </div>
            <Button onClick={() => setOrder(p)} data-testid={`order-part-${p.id}`}
              className="w-full mt-4 bg-[#E60012] hover:bg-[#c40010] text-white rounded-none font-mono text-[10px] uppercase tracking-widest h-10">
              <ShoppingCart className="w-3 h-3 mr-2" /> Pesan & Estimasi
            </Button>
          </div>
        ))}
        {!filtered.length && <div className="md:col-span-2 xl:col-span-3"><EmptyState title="Suku cadang tidak ditemukan" hint="Coba kata kunci atau kategori lain." /></div>}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="bg-white border border-neutral-200">
          <div className="p-5 border-b font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500 flex items-center gap-2">
            <Truck className="w-3 h-3 text-[#E60012]" /> Pelacakan Pengiriman Komponen
          </div>
          <div className="divide-y" data-testid="part-orders-list">
            {orders.map((o) => (
              <div key={o.id} className="p-5" data-testid={`part-order-${o.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-[10px] tracking-widest text-neutral-400">{o.order_no} · {o.tracking_no}</div>
                    <div className="font-display font-bold text-base mt-1">{o.sparepart_name} × {o.quantity}</div>
                    <div className="font-mono text-[10px] text-neutral-500 mt-1">{o.destination} · ETA {o.eta?.slice(0, 10)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-black">{formatIDR(o.total)}</div>
                    {canManage ? (
                      <Select value={o.status} onValueChange={(v) => setStatus(o, v)}>
                        <SelectTrigger className="rounded-none h-8 w-40 text-xs mt-2" data-testid={`order-status-${o.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{SHIP.map((s) => <SelectItem key={s} value={s}>{SHIP_LABEL[s]}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <div className="font-mono text-[10px] uppercase tracking-widest mt-2">{SHIP_LABEL[o.status]}</div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-1">
                  {SHIP.map((s, i) => (
                    <div key={s} className={`h-1 flex-1 ${SHIP.indexOf(o.status) >= i ? "bg-[#E60012]" : "bg-neutral-200"}`} />
                  ))}
                </div>
              </div>
            ))}
            {!orders.length && <div className="p-6"><EmptyState title="Belum ada pesanan" hint="Pesan suku cadang dari katalog di atas." /></div>}
          </div>
        </div>

        <div className="bg-neutral-950 text-white p-6 h-fit">
          <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-white/40 flex items-center gap-2">
            <FileDown className="w-3 h-3 text-[#E60012]" /> Repair Manual
          </div>
          <div className="mt-4 space-y-3">
            {MANUALS.map((m) => (
              <a key={m.code} href={m.url} target="_blank" rel="noreferrer"
                data-testid={`manual-${m.code}`}
                className="block border border-white/10 p-4 hover:border-[#E60012] transition-colors">
                <div className="font-mono text-[9px] tracking-widest text-[#E60012]">{m.code}</div>
                <div className="text-sm mt-1">{m.title}</div>
                <div className="font-mono text-[9px] text-white/40 mt-1">Unduh PDF →</div>
              </a>
            ))}
          </div>
        </div>
      </div>

      {order && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <div className="font-mono text-[10px] tracking-widest text-neutral-400">{order.sku}</div>
                <div className="font-display font-black text-xl">{order.name}</div>
              </div>
              <button onClick={() => setOrder(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-testid="order-qty-input" className="rounded-none" />
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="rounded-none"><SelectValue placeholder="Klien" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa klien</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Alamat tujuan pengiriman" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} data-testid="order-dest-input" className="rounded-none" />
              <Textarea placeholder="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-none" />
              <div className="bg-neutral-100 p-4">
                <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Estimasi Harga</div>
                <div className="font-display font-black text-2xl mt-1" data-testid="order-estimate">{formatIDR(estimate)}</div>
                <div className="font-mono text-[10px] text-neutral-500 mt-1">+ PPN 11% = {formatIDR(estimate * 1.11)}</div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOrder(null)} className="rounded-none">Batal</Button>
              <Button onClick={submit} data-testid="submit-order-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Buat Pesanan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
