import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X, Trash2, BellRing, LogIn, LogOut } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { PageHeader, StatCard, EmptyState } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

const empty = {
  name: "", unit_id: "all", center_lat: -2.205, center_lng: 115.4,
  radius_m: 3000, alert_on: "both", active: true, notify_email: "",
};

export default function Geofencing() {
  const [fences, setFences] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [units, setUnits] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => {
    const [g, a, u] = await Promise.all([api.get("/geofences"), api.get("/alerts"), api.get("/units")]);
    setFences(g.data); setAlerts(a.data); setUnits(u.data);
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const save = async () => {
    if (!form.name) { toast.error("Nama zona wajib diisi"); return; }
    try {
      await api.post("/geofences", {
        ...form,
        unit_id: form.unit_id === "all" ? null : form.unit_id,
        center_lat: Number(form.center_lat), center_lng: Number(form.center_lng),
        radius_m: Number(form.radius_m),
        notify_email: form.notify_email || null,
      });
      toast.success("Geofence dibuat"); setOpen(false); setForm(empty); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const toggle = async (f) => {
    try {
      await api.put(`/geofences/${f.id}`, { ...f, active: !f.active });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remove = async (f) => {
    try { await api.delete(`/geofences/${f.id}`); toast.success("Zona dihapus"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const markAll = async () => {
    await api.post("/alerts/read-all"); toast.success("Semua notifikasi ditandai terbaca"); load();
  };

  const unread = alerts.filter((a) => !a.read).length;

  return (
    <div data-testid="geofencing-page">
      <PageHeader
        eyebrow="/ Pagar Elektronik"
        title="Geofencing"
        description="Tetapkan batas wilayah operasional unit. Sistem mengirim peringatan instan di aplikasi dan email saat unit keluar atau masuk area."
        actions={
          <div className="flex gap-3">
            <Button onClick={markAll} variant="outline" data-testid="read-all-alerts-btn" className="rounded-none h-11 font-mono text-xs uppercase tracking-widest">
              Tandai Terbaca
            </Button>
            <Button onClick={() => setOpen(true)} data-testid="add-geofence-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest">
              <Plus className="w-4 h-4 mr-2" /> Zona Baru
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Zona" value={fences.length} accent />
        <StatCard label="Zona Aktif" value={fences.filter((f) => f.active).length} />
        <StatCard label="Peringatan" value={alerts.length} />
        <StatCard label="Belum Dibaca" value={unread} sub="notifikasi baru" />
      </div>

      <div className="bg-white border border-neutral-200 mb-8">
        <div className="p-5 border-b font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500">Daftar Zona</div>
        <Table>
          <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Unit</TableHead><TableHead>Pusat</TableHead><TableHead>Radius</TableHead><TableHead>Trigger</TableHead><TableHead>Email</TableHead><TableHead>Aktif</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {fences.map((f) => (
              <TableRow key={f.id} data-testid={`geofence-row-${f.id}`}>
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell className="font-mono text-xs">{f.unit_id ? (units.find((u) => u.id === f.unit_id)?.name || "-") : "Semua unit"}</TableCell>
                <TableCell className="font-mono text-xs">{f.center_lat.toFixed(4)}, {f.center_lng.toFixed(4)}</TableCell>
                <TableCell className="font-mono text-xs">{(f.radius_m / 1000).toFixed(1)} km</TableCell>
                <TableCell className="font-mono text-[10px] uppercase tracking-widest">{f.alert_on}</TableCell>
                <TableCell className="text-xs text-neutral-500">{f.notify_email || "-"}</TableCell>
                <TableCell>
                  <Switch checked={f.active} onCheckedChange={() => toggle(f)} data-testid={`geofence-toggle-${f.id}`} />
                </TableCell>
                <TableCell>
                  <button onClick={() => remove(f)} data-testid={`geofence-delete-${f.id}`} className="text-neutral-400 hover:text-[#E60012]">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!fences.length && <div className="p-6"><EmptyState title="Belum ada zona" hint="Buat zona untuk mulai memantau batas operasional." /></div>}
      </div>

      <div className="bg-white border border-neutral-200">
        <div className="p-5 border-b font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500 flex items-center gap-2">
          <BellRing className="w-3 h-3 text-[#E60012]" /> Riwayat Peringatan
        </div>
        <div className="divide-y max-h-[420px] overflow-y-auto" data-testid="alerts-list">
          {alerts.map((a) => (
            <div key={a.id} className={`p-4 flex items-start gap-4 ${a.read ? "" : "bg-[#E60012]/[0.04]"}`} data-testid={`alert-item-${a.id}`}>
              <div className={`w-8 h-8 grid place-items-center shrink-0 ${a.event === "exit" ? "bg-[#E60012] text-white" : "bg-neutral-950 text-white"}`}>
                {a.event === "exit" ? <LogOut className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm">
                  <span className="font-display font-bold">{a.unit_name}</span>{" "}
                  {a.event === "exit" ? "keluar dari" : "masuk ke"}{" "}
                  <span className="font-display font-bold">{a.geofence_name}</span>
                </div>
                <div className="font-mono text-[10px] text-neutral-500 mt-1">
                  {a.lat.toFixed(5)}, {a.lng.toFixed(5)} · {a.distance_m} m dari pusat · {a.created_at?.slice(0, 19).replace("T", " ")} UTC
                </div>
              </div>
            </div>
          ))}
          {!alerts.length && <div className="p-6"><EmptyState title="Belum ada peringatan" hint="Notifikasi akan muncul saat unit melewati batas zona." /></div>}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="font-display font-black text-xl">Zona Geofence Baru</div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Input placeholder="Nama zona" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="geofence-name-input" className="rounded-none" />
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}>
                <SelectTrigger className="rounded-none" data-testid="geofence-unit-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua unit</SelectItem>
                  {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" step="0.0001" placeholder="Latitude" value={form.center_lat} onChange={(e) => setForm({ ...form, center_lat: e.target.value })} data-testid="geofence-lat-input" className="rounded-none" />
                <Input type="number" step="0.0001" placeholder="Longitude" value={form.center_lng} onChange={(e) => setForm({ ...form, center_lng: e.target.value })} data-testid="geofence-lng-input" className="rounded-none" />
              </div>
              <Input type="number" placeholder="Radius (meter)" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} data-testid="geofence-radius-input" className="rounded-none" />
              <Select value={form.alert_on} onValueChange={(v) => setForm({ ...form, alert_on: v })}>
                <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Keluar & Masuk</SelectItem>
                  <SelectItem value="exit">Keluar saja</SelectItem>
                  <SelectItem value="enter">Masuk saja</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Email penerima peringatan (opsional)" value={form.notify_email} onChange={(e) => setForm({ ...form, notify_email: e.target.value })} data-testid="geofence-email-input" className="rounded-none" />
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>
              <Button onClick={save} data-testid="save-geofence-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Simpan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
