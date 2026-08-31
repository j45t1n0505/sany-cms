import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, X, Video, Phone, Send, Paperclip, ExternalLink } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { PageHeader, StatCard, EmptyState } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const empty = { topic: "", unit_id: "none", technician_name: "", mode: "video", scheduled_at: "", description: "" };

export default function RCS() {
  const [sessions, setSessions] = useState([]);
  const [units, setUnits] = useState([]);
  const [techs, setTechs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [active, setActive] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [text, setText] = useState("");
  const fileRef = useRef(null);

  const load = async (keepId) => {
    const [s, u, t] = await Promise.all([api.get("/rcs/sessions"), api.get("/units"), api.get("/technicians")]);
    setSessions(s.data); setUnits(u.data); setTechs(t.data);
    const id = keepId || active?.id;
    if (id) setActive(s.data.find((x) => x.id === id) || null);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.topic) { toast.error("Isi topik konsultasi"); return; }
    try {
      const r = await api.post("/rcs/sessions", {
        ...form,
        unit_id: form.unit_id === "none" ? null : form.unit_id,
        scheduled_at: form.scheduled_at || null,
      });
      toast.success("Sesi konsultasi dibuat");
      setOpen(false); setForm(empty); await load(r.data.id);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const send = async () => {
    if (!text.trim() || !active) return;
    try {
      await api.post(`/rcs/sessions/${active.id}/messages`, { text });
      setText(""); load(active.id);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const attach = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !active) return;
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await api.post(`/rcs/sessions/${active.id}/messages`, {
        text: f.name, attachment_url: r.data.path, attachment_type: f.type,
      });
      toast.success("Lampiran terkirim"); load(active.id);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const join = async () => {
    setInCall(true);
    try { await api.put(`/rcs/sessions/${active.id}/status`, null, { params: { status: "live" } }); load(active.id); } catch {}
  };

  const end = async () => {
    setInCall(false);
    try { await api.put(`/rcs/sessions/${active.id}/status`, null, { params: { status: "closed" } }); load(active.id); } catch {}
  };

  const fileUrl = (p) => `${api.defaults.baseURL}/files/${p}?auth=${localStorage.getItem("sp_token")}`;

  return (
    <div data-testid="rcs-page">
      <PageHeader
        eyebrow="/ Remote Consultation Service"
        title="Konsultasi Jarak Jauh"
        description="Terhubung langsung dengan teknisi ahli SANY melalui panggilan audio/video, chat, dan kirim foto kerusakan untuk panduan perbaikan darurat."
        actions={
          <Button onClick={() => setOpen(true)} data-testid="add-rcs-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" /> Sesi Baru
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Sesi" value={sessions.length} accent />
        <StatCard label="Terjadwal" value={sessions.filter((s) => s.status === "scheduled").length} />
        <StatCard label="Berlangsung" value={sessions.filter((s) => s.status === "live").length} />
        <StatCard label="Selesai" value={sessions.filter((s) => s.status === "closed").length} />
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4 lg:gap-6">
        <div className="bg-white border border-neutral-200 divide-y max-h-[280px] lg:max-h-[620px] overflow-y-auto">
          {sessions.map((s) => (
            <button key={s.id} onClick={() => { setActive(s); setInCall(false); }}
              data-testid={`rcs-session-${s.id}`}
              className={`w-full text-left p-4 hover:bg-neutral-50 transition-colors ${active?.id === s.id ? "bg-neutral-50 border-l-4 border-[#E60012]" : ""}`}>
              <div className="flex items-center gap-2">
                {s.mode === "audio" ? <Phone className="w-3 h-3 text-[#E60012]" /> : <Video className="w-3 h-3 text-[#E60012]" />}
                <div className="font-display font-bold text-sm truncate">{s.topic}</div>
              </div>
              <div className="font-mono text-[10px] text-neutral-400 mt-1 uppercase tracking-widest">
                {s.status} · {s.unit_name || "tanpa unit"}
              </div>
              <div className="font-mono text-[10px] text-neutral-400">{s.technician_name || "teknisi SANY"}</div>
            </button>
          ))}
          {!sessions.length && <div className="p-6"><EmptyState title="Belum ada sesi" hint="Buat sesi konsultasi darurat." /></div>}
        </div>

        <div className="bg-white border border-neutral-200 flex flex-col min-h-[480px] lg:min-h-[620px]" data-testid="rcs-detail">
          {!active ? (
            <div className="flex-1 grid place-items-center text-sm text-neutral-500 p-8">
              Pilih atau buat sesi konsultasi untuk memulai.
            </div>
          ) : (
            <>
              <div className="p-5 border-b flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#E60012]">{active.mode === "audio" ? "Audio Call" : "Video Call"} · {active.status}</div>
                  <div className="font-display font-black text-xl mt-1">{active.topic}</div>
                  <div className="font-mono text-[10px] text-neutral-400 mt-1">
                    Room {active.room_name} {active.scheduled_at ? `· ${active.scheduled_at.slice(0, 16).replace("T", " ")}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!inCall ? (
                    <Button onClick={join} data-testid="join-call-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-10 font-mono text-[10px] uppercase tracking-widest">
                      <Video className="w-3 h-3 mr-2" /> Masuk Panggilan
                    </Button>
                  ) : (
                    <Button onClick={end} data-testid="end-call-btn" variant="outline" className="rounded-none h-10 font-mono text-[10px] uppercase tracking-widest">
                      Akhiri Sesi
                    </Button>
                  )}
                  <a href={active.room_url} target="_blank" rel="noreferrer" data-testid="open-room-link"
                    className="h-10 px-3 border border-neutral-300 grid place-items-center hover:border-[#E60012]">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {inCall && (
                <div className="bg-neutral-950 h-[240px] sm:h-[320px] lg:h-[380px]">
                  <iframe
                    title="rcs-call"
                    data-testid="rcs-call-frame"
                    src={`${active.room_url}#config.prejoinPageEnabled=false&config.startWithVideoMuted=${active.mode === "audio"}`}
                    allow="camera; microphone; fullscreen; display-capture; autoplay"
                    className="w-full h-full border-0"
                  />
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-5 space-y-4" data-testid="rcs-messages">
                {active.description && (
                  <div className="bg-neutral-100 p-4 text-sm">{active.description}</div>
                )}
                {active.messages?.map((m) => (
                  <div key={m.id} className="border-l-2 border-[#E60012] pl-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                      {m.author} · {m.at?.slice(11, 16)}
                    </div>
                    <div className="text-sm mt-1">{m.text}</div>
                    {m.attachment_url && (
                      m.attachment_type?.startsWith("image/") ? (
                        <img src={fileUrl(m.attachment_url)} alt="lampiran" className="mt-2 max-h-48 border" />
                      ) : (
                        <a href={fileUrl(m.attachment_url)} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-[#E60012] mt-1 inline-block">Buka lampiran →</a>
                      )
                    )}
                  </div>
                ))}
                {!active.messages?.length && <div className="text-sm text-neutral-400">Belum ada pesan.</div>}
              </div>

              <div className="p-4 border-t flex gap-2">
                <input ref={fileRef} type="file" onChange={attach} className="hidden" />
                <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="rcs-attach-btn" className="rounded-none h-11 w-11 p-0">
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Tulis pesan ke teknisi…" data-testid="rcs-message-input" className="rounded-none h-11" />
                <Button onClick={send} data-testid="rcs-send-btn" className="bg-neutral-950 hover:bg-neutral-800 text-white rounded-none h-11">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="font-display font-black text-xl">Sesi Konsultasi Baru</div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Input placeholder="Topik konsultasi" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} data-testid="rcs-topic-input" className="rounded-none" />
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}>
                <SelectTrigger className="rounded-none" data-testid="rcs-unit-select"><SelectValue placeholder="Unit terkait" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa unit</SelectItem>
                  {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.technician_name} onValueChange={(v) => setForm({ ...form, technician_name: v })}>
                  <SelectTrigger className="rounded-none" data-testid="rcs-tech-select"><SelectValue placeholder="Teknisi" /></SelectTrigger>
                  <SelectContent>{techs.map((t) => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                  <SelectTrigger className="rounded-none" data-testid="rcs-mode-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="audio">Audio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} data-testid="rcs-schedule-input" className="rounded-none" />
              <Textarea placeholder="Deskripsi masalah" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-none" />
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>
              <Button onClick={create} data-testid="save-rcs-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Buat Sesi</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
