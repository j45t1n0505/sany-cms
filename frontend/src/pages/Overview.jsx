import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { Truck, Wrench, Users, FileText, AlertTriangle, CalendarRange } from "lucide-react";
import api, { formatIDR } from "../lib/api";
import { PageHeader, StatCard } from "../components/PageBits";

const COLORS = ["#E60012", "#0A0A0A", "#F59E0B", "#525252", "#a3a3a3"];

export default function Overview() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/analytics/summary").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <div className="font-mono text-xs uppercase tracking-widest text-neutral-400">Memuat data…</div>;

  const catData = Object.entries(data.units_by_category).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(data.units_by_status).map(([name, value]) => ({ name, value }));

  return (
    <div>
      <PageHeader
        eyebrow="/ Dashboard · Overview"
        title="Ringkasan Operasional"
        description="Snapshot real-time dari armada, inventaris, dan pipeline penjualan."
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <StatCard accent label="Total Unit" value={data.totals.units} sub="Katalog aktif" />
        <StatCard label="Sparepart" value={data.totals.spareparts} sub="SKU terdaftar" />
        <StatCard label="Klien" value={data.totals.clients} sub="Prospek + aktif" />
        <StatCard label="Quotation" value={data.totals.quotations} sub="Sepanjang periode" />
        <StatCard label="Rental" value={data.totals.rentals} sub="Kontrak" />
        <StatCard label="Low Stock" value={data.totals.low_stock} sub="Perlu restock" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="lg:col-span-2 bg-white border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="font-mono text-[10px] tracking-widest uppercase text-neutral-500">Tren Penjualan (Accepted Quotations)</div>
            <div className="font-display font-black text-2xl">{formatIDR(data.revenue.accepted)}</div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.sales_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="month" stroke="#999" fontSize={11} />
              <YAxis stroke="#999" fontSize={11} tickFormatter={(v) => `${(v / 1e9).toFixed(1)}B`} />
              <Tooltip formatter={(v) => formatIDR(v)} contentStyle={{ borderRadius: 0, border: "1px solid #ddd" }} />
              <Line type="monotone" dataKey="amount" stroke="#E60012" strokeWidth={3} dot={{ r: 5, fill: "#E60012" }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1}} className="bg-white border border-neutral-200 p-6">
          <div className="font-mono text-[10px] tracking-widest uppercase text-neutral-500 mb-2">Status Unit</div>
          <div className="font-display font-black text-2xl mb-4">{data.totals.units} Total</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 0 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {statusData.map((s, i) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="capitalize text-neutral-600">{s.name}</span>
                <span className="ml-auto font-mono">{s.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.15}} className="bg-white border border-neutral-200 p-6">
          <div className="font-mono text-[10px] tracking-widest uppercase text-neutral-500 mb-6">Utilisasi Kategori</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={catData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" stroke="#999" fontSize={11} />
              <YAxis stroke="#999" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 0, border: "1px solid #ddd" }} />
              <Bar dataKey="value" fill="#E60012" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.2}} className="bg-neutral-950 text-white p-6">
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase text-[#E60012] mb-4">
            <AlertTriangle className="w-3 h-3" /> Stok Menipis
          </div>
          {data.low_stock_items.length === 0 ? (
            <div className="text-white/40 text-sm">Semua stok dalam batas aman.</div>
          ) : (
            <div className="space-y-3">
              {data.low_stock_items.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div>
                    <div className="text-sm">{s.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">{s.sku} · min {s.min_stock}</div>
                  </div>
                  <div className="font-display font-black text-xl">{s.stock}</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
