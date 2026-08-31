import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, X, Star, Wrench, Upload, CheckCircle2 } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { PageHeader, StatCard, EmptyState } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useAuth } from "../context/AuthContext";

const FLOW = ["submitted", "assigned", "on_the_way", "in_progress", "completed", "closed"];
const FLOW_LABEL = {
  submitted: "Diajukan", assigned: "Mekanik Ditugaskan", on_the_way: "Mekanik Menuju Lokasi",
  in_progress: "Pengerjaan", completed: "Selesai", closed: "Ditutup",
};
const PRIO = { low: "bg-neutral-100 text-neutral-600", normal: "bg-blue-50 text-blue-700", high: "bg-amber-50 text-amber-700", emergency: "bg-[#E60012] text-white" };

const empty = { unit_id: "", client_id: "none", issue_type: "engine", priority: "normal", description: "", location: "", contact_phone: "", photos: [] };

export default function ServiceRequests() {
  const { hasRole } = useAuth();
  const canManage = hasRole("warehouse_staff", "sales_manager");
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [clients, setClients] = useState([]);
  const [techs, setTechs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [detail, setDetail] = useState(null);
  const [rate, setRate] = useState({ rating: 5, review: "" });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    const [s, u, c, t] = await Promise.all([
      api.get("/service-requests"), api.get("/units"), api.get("/clients").catch(() => ({ data: [] })), api.get("/technicians"),
    ]);
    setItems(s.data); setUnits(u.data); setClients(c.data); setTechs(t.data);
    if (detail) setDetail(s.data.find((x) => x.id === detail.id) || null);
  };
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((p) => ({ ...p, photos: [...p.photos, r.data.path] }));
      toast.success("Foto terunggah");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    setUploading(false);
  };

  const save = async () => {
    if (!form.unit_id || !form.description) { toast.error("Pilih unit dan isi deskripsi kerusakan"); return; }
    try {
      await api.post("/service-requests", { ...form, client_id: form.client_id === "none" ? null : form.client_id });
      toast.success("Permintaan servis terkirim"); setOpen(false); setForm(empty); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const setStatus = async (sr, status) => {
    try { await api.put(`/service-requests/${sr.id}/status`, null, { params: { status } }); toast.success("Status diperbarui"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const assign = async (sr, name) => {
    try { await api.put(`/service-requests/${sr.id}/assign`, null, { params: { technician_name: name } }); toast.success("Mekanik ditugaskan"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const submitRating = async (sr) => {
    try {
      await api.put(`/service-requests/${sr.id}/rating`, rate);
      toast.success("Terima kasih atas penilaian Anda"); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const openCount = items.filter((i) => !["completed", "closed"].includes(i.status)).length;
  const rated = items.filter((i) => i.rating);
  const avg = rated.length ? (rated.reduce((a, i) => a + i.rating, 0) / rated.length).toFixed(1) : "-";

  return (
    <div data-testid="service-page">
      <PageHeader
        eyebrow="/ Service & Maintenance"
        title="Permintaan Servis Instan"
        description="Ajukan perbaikan online, lacak status mekanik secara real-time, dan beri penilaian setelah servis selesai."
        actions={
          <Button onClick={() => setOpen(true)} data-testid="add-service-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" /> Ajukan Servis
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Tiket" value={items.length} accent />
        <StatCard label="Sedang Berjalan" value={openCount} />
        <StatCard label="Darurat" value={items.filter((i) => i.priority === "emergency").length} />
        <StatCard label="Rating Rata-rata" value={avg} sub={`${rated.length} penilaian`} />
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-6">
        <div className="space-y-4">
          {items.map((sr) => (
            <button key={sr.id} onClick={() => { setDetail(sr); setRate({ rating: sr.rating || 5, review: sr.review || "" }); }}
              data-testid={`service-card-${sr.id}`}
              className={`w-full text-left bg-white border p-5 transition-all hover:shadow-lg ${detail?.id === sr.id ? "border-[#E60012]" : "border-neutral-200"}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-[10px] tracking-widest text-neutral-400">{sr.ticket_no}</div>
                  <div className="font-display font-black text-lg mt-1">{sr.unit_name}</div>
                  <div className="text-sm text-neutral-500 mt-1 line-clamp-2">{sr.description}</div>
                </div>
                <div className="text-right shrink-0 space-y-2">
                  <span className={`inline-block font-mono text-[10px] uppercase tracking-widest px-2 py-1 ${PRIO[sr.priority]}`}>{sr.priority}</span>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">{FLOW_LABEL[sr.status]}</div>
                </div>
              </div>
              <div className="mt-4 flex gap-1">
                {FLOW.slice(0, 5).map((s, i) => (
                  <div key={s} className={`h-1 flex-1 ${FLOW.indexOf(sr.status) >= i ? "bg-[#E60012]" : "bg-neutral-200"}`} />
                ))}
              </div>
              {sr.technician && (
                <div className="mt-3 font-mono text-[10px] text-neutral-500 flex items-center gap-1">
                  <Wrench className="w-3 h-3" /> {sr.technician.name} · {sr.technician.phone}
                </div>
              )}
            </button>
          ))}
          {!items.length && <EmptyState title="Belum ada permintaan servis" hint="Ajukan permintaan perbaikan untuk unit Anda." />}
        </div>

        <div className="bg-white border border-neutral-200 p-6 h-fit lg:sticky lg:top-8" data-testid="service-detail-panel">
          {!detail ? (
            <div className="text-sm text-neutral-500">Pilih tiket untuk melihat detail & pelacakan mekanik.</div>
          ) : (
            <>
              <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#E60012]">{detail.ticket_no}</div>
              <div className="font-display font-black text-2xl mt-2">{detail.unit_name}</div>
              <div className="text-sm text-neutral-500 mt-2">{detail.description}</div>
              {detail.location && <div className="font-mono text-[10px] text-neutral-400 mt-2">Lokasi: {detail.location}</div>}

              {canManage && (
                <div className="mt-5 space-y-3">
                  <Select value={detail.technician?.name || ""} onValueChange={(v) => assign(detail, v)}>
                    <SelectTrigger className="rounded-none" data-testid="assign-tech-select"><SelectValue placeholder="Tugaskan mekanik" /></SelectTrigger>
                    <SelectContent>{techs.map((t) => <SelectItem key={t.name} value={t.name}>{t.name} — {t.specialty}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={detail.status} onValueChange={(v) => setStatus(detail, v)}>
                    <SelectTrigger className="rounded-none" data-testid="service-status-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{FLOW.map((s) => <SelectItem key={s} value={s}>{FLOW_LABEL[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              <div className="mt-6 font-mono text-[10px] tracking-[0.3em] uppercase text-neutral-400">Pelacakan Real-Time</div>
              <div className="mt-3 space-y-3">
                {detail.timeline?.map((t, i) => (
                  <div key={i} className="flex gap-3" data-testid={`service-timeline-${i}`}>
                    <CheckCircle2 className="w-4 h-4 text-[#E60012] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">{FLOW_LABEL[t.status] || t.status}</div>
                      <div className="font-mono text-[10px] text-neutral-400">{t.note} · {t.at?.slice(0, 16).replace("T", " ")}</div>
                    </div>
                  </div>
                ))}
              </div>

              {["completed", "closed"].includes(detail.status) && (
                <div className="mt-6 pt-6 border-t">
                  <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">Penilaian Servis</div>
                  {detail.rating ? (
                    <div>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={`w-5 h-5 ${n <= detail.rating ? "fill-[#E60012] text-[#E60012]" : "text-neutral-300"}`} />
                        ))}
                      </div>
                      {detail.review && <div className="text-sm text-neutral-600 mt-2">"{detail.review}"</div>}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setRate({ ...rate, rating: n })} data-testid={`rate-star-${n}`}>
                            <Star className={`w-6 h-6 ${n <= rate.rating ? "fill-[#E60012] text-[#E60012]" : "text-neutral-300"}`} />
                          </button>
                        ))}
                      </div>
                      <Textarea placeholder="Ulasan Anda" value={rate.review} onChange={(e) => setRate({ ...rate, review: e.target.value })} data-testid="rate-review-input" className="rounded-none" />
                      <Button onClick={() => submitRating(detail)} data-testid="submit-rating-btn" className="w-full bg-neutral-950 hover:bg-neutral-800 text-white rounded-none font-mono text-xs uppercase tracking-widest">
                        Kirim Penilaian
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg my-8">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="font-display font-black text-xl">Permintaan Servis Baru</div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}>
                <SelectTrigger className="rounded-none" data-testid="service-unit-select"><SelectValue placeholder="Pilih Unit" /></SelectTrigger>
                <SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.issue_type} onValueChange={(v) => setForm({ ...form, issue_type: v })}>
                  <SelectTrigger className="rounded-none" data-testid="service-issue-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["engine", "hydraulic", "electrical", "undercarriage", "periodic"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="rounded-none" data-testid="service-priority-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["low", "normal", "high", "emergency"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="rounded-none"><SelectValue placeholder="Klien (opsional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa klien</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>)}
                </SelectContent>
              </Select>
              <Textarea placeholder="Deskripsi kerusakan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="service-desc-input" className="rounded-none" />
              <Input placeholder="Lokasi unit" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="rounded-none" />
              <Input placeholder="No. telepon kontak" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="rounded-none" />
              <input ref={fileRef} type="file" accept="image/*" onChange={upload} className="hidden" />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="service-upload-btn" className="w-full rounded-none font-mono text-xs uppercase tracking-widest">
                <Upload className="w-4 h-4 mr-2" /> {uploading ? "Mengunggah…" : `Unggah Foto (${form.photos.length})`}
              </Button>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>
              <Button onClick={save} data-testid="save-service-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Kirim Permintaan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
