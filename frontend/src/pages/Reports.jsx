import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Timer, PauseCircle, Percent, Wallet } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import api, { formatApiError, formatIDR } from "../lib/api";
import { PageHeader, StatCard, EmptyState } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function Reports() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async (m) => {
    setLoading(true);
    try {
      const r = await api.get("/reports/utilization", { params: { month: m } });
      setData(r.data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setLoading(false);
  };
  useEffect(() => { load(month); }, [month]);

  const exportCsv = () => {
    if (!data) return;
    const head = ["Unit", "Model", "Kategori", "HM Awal", "HM Akhir", "Jam Kerja", "Idle (jam)", "Utilisasi %", "Tarif Harian", "Estimasi Tagihan"];
    const lines = data.rows.map((r) => [
      r.name, r.model_code, r.category, r.hm_start, r.hm_end,
      r.working_hours, r.idle_hours, r.utilization_pct, r.daily_rate, r.billable_amount,
    ]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `utilisasi-${data.month}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV terunduh");
  };

  const chart = (data?.rows || []).slice(0, 10).map((r) => ({
    name: r.model_code || r.name.slice(0, 10),
    Kerja: r.working_hours,
    Idle: r.idle_hours,
  }));

  return (
    <div data-testid="reports-page">
      <PageHeader
        eyebrow="/ Laporan"
        title="Laporan Utilisasi Unit"
        description="Rekap jam kerja (HM) dan idle time setiap unit per bulan, lengkap dengan estimasi tagihan sewa."
        actions={
          <div className="flex gap-3">
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              data-testid="report-month-input"
              className="rounded-none h-11 w-44"
            />
            <Button onClick={exportCsv} data-testid="export-csv-btn" className="bg-neutral-950 hover:bg-neutral-800 text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest">
              <Download className="w-4 h-4 mr-2" /> CSV
            </Button>
          </div>
        }
      />

      {loading && <div className="font-mono text-xs text-neutral-500 mb-6">Memuat laporan…</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Jam Kerja" value={`${data.totals.working_hours.toLocaleString("id-ID")} j`} accent icon={Timer} />
            <StatCard label="Total Idle" value={`${data.totals.idle_hours.toLocaleString("id-ID")} j`} icon={PauseCircle} />
            <StatCard label="Rata-rata Utilisasi" value={`${data.totals.avg_utilization_pct}%`} icon={Percent} />
            <StatCard label="Estimasi Tagihan" value={formatIDR(data.totals.billable_amount)} sub="berdasarkan tarif sewa" icon={Wallet} />
          </div>

          <div className="bg-white border border-neutral-200 p-5 mb-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500 mb-4">
              10 Unit Paling Produktif — {data.month}
            </div>
            <div className="h-72" data-testid="utilization-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                  <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} />
                  <Tooltip contentStyle={{ borderRadius: 0, fontFamily: "monospace", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 11 }} />
                  <Bar dataKey="Kerja" stackId="a" fill="#E60012" />
                  <Bar dataKey="Idle" stackId="a" fill="#d4d4d4" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>HM Awal</TableHead>
                  <TableHead>HM Akhir</TableHead>
                  <TableHead>Jam Kerja</TableHead>
                  <TableHead>Idle</TableHead>
                  <TableHead>Utilisasi</TableHead>
                  <TableHead>Estimasi Tagihan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.unit_id} data-testid={`report-row-${r.unit_id}`}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="font-mono text-[10px] text-neutral-400">{r.model_code} · {r.category}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.hm_start}</TableCell>
                    <TableCell className="font-mono text-xs">{r.hm_end}</TableCell>
                    <TableCell className="font-mono text-xs font-bold">{r.working_hours} j</TableCell>
                    <TableCell className="font-mono text-xs text-neutral-500">{r.idle_hours} j</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-neutral-200">
                          <div className="h-full bg-[#E60012]" style={{ width: `${Math.min(100, r.utilization_pct)}%` }} />
                        </div>
                        <span className="font-mono text-[10px]">{r.utilization_pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.billable_amount ? formatIDR(r.billable_amount) : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!data.rows.length && <div className="p-6"><EmptyState title="Tidak ada data" hint="Belum ada telemetri untuk bulan ini." /></div>}
          </div>
        </>
      )}
    </div>
  );
}
