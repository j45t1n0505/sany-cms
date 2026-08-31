import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from "react-leaflet";
import { Activity, Fuel, Gauge, Radio, Timer, MapPin } from "lucide-react";
import api from "../lib/api";
import { PageHeader, StatCard } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

const CENTER = [-2.5, 113.0];

function unitIcon(on) {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:9999px;background:${on ? "#E60012" : "#71717a"};border:3px solid #fff;box-shadow:0 0 0 4px ${on ? "rgba(230,0,18,.25)" : "rgba(0,0,0,.12)"}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 13, { duration: 1.2 });
  }, [target, map]);
  return null;
}

export default function Tracking() {
  const [units, setUnits] = useState([]);
  const [fences, setFences] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [q, setQ] = useState("");
  const timer = useRef(null);

  const load = async () => {
    const [t, g] = await Promise.all([api.get("/tracking/units"), api.get("/geofences")]);
    setUnits(t.data);
    setFences(g.data);
  };

  useEffect(() => {
    load();
    timer.current = setInterval(load, 15000);
    return () => clearInterval(timer.current);
  }, []);

  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    api.get(`/tracking/units/${selected}/history`, { params: { limit: 120 } })
      .then((r) => setHistory(r.data));
  }, [selected, units.length]);

  const filtered = useMemo(
    () => units.filter((u) => u.name.toLowerCase().includes(q.toLowerCase())),
    [units, q]
  );
  const sel = units.find((u) => u.unit_id === selected);
  const active = units.filter((u) => u.engine_on).length;
  const totalHm = units.reduce((a, u) => a + (u.hm || 0), 0);

  return (
    <div data-testid="tracking-page">
      <PageHeader
        eyebrow="/ IoT & GPS"
        title="Manajemen Aset Real-Time"
        description="Pantau lokasi unit, jam kerja (HM), bahan bakar, dan riwayat pergerakan alat berat secara langsung."
        actions={
          <Button onClick={load} data-testid="refresh-tracking-btn" className="bg-neutral-950 hover:bg-neutral-800 text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest">
            <Radio className="w-4 h-4 mr-2" /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Unit Terlacak" value={units.length} accent />
        <StatCard label="Mesin Menyala" value={active} sub={`${units.length - active} idle`} />
        <StatCard label="Total HM" value={Math.round(totalHm).toLocaleString("id-ID")} sub="jam operasi" />
        <StatCard label="Geofence Aktif" value={fences.filter((f) => f.active).length} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="bg-white border border-neutral-200 overflow-hidden h-[560px]" data-testid="tracking-map">
          <MapContainer center={CENTER} zoom={5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {fences.filter((f) => f.active).map((f) => (
              <Circle key={f.id} center={[f.center_lat, f.center_lng]} radius={f.radius_m}
                pathOptions={{ color: "#E60012", weight: 1.5, fillOpacity: 0.06, dashArray: "6 6" }}>
                <Popup><span className="font-mono text-xs">{f.name}</span></Popup>
              </Circle>
            ))}
            {history.length > 1 && (
              <Polyline positions={history.map((h) => [h.lat, h.lng])} pathOptions={{ color: "#111", weight: 3, opacity: 0.7 }} />
            )}
            {units.map((u) => (
              <Marker key={u.unit_id} position={[u.lat, u.lng]} icon={unitIcon(u.engine_on)}
                eventHandlers={{ click: () => setSelected(u.unit_id) }}>
                <Popup>
                  <div className="font-display font-bold text-sm">{u.name}</div>
                  <div className="font-mono text-[11px] text-neutral-600 mt-1">
                    HM {u.hm} · {u.speed} km/j · {u.engine_on ? "ON" : "OFF"}
                  </div>
                  <div className="font-mono text-[10px] text-neutral-400">{u.site}</div>
                </Popup>
              </Marker>
            ))}
            {sel && <FlyTo target={sel} />}
          </MapContainer>
        </div>

        <div className="bg-white border border-neutral-200 flex flex-col h-[560px]">
          <div className="p-4 border-b">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari unit…"
              data-testid="tracking-search" className="rounded-none h-10" />
          </div>
          <div className="flex-1 overflow-y-auto divide-y">
            {filtered.map((u) => (
              <button key={u.unit_id} onClick={() => setSelected(u.unit_id)}
                data-testid={`tracking-unit-${u.unit_id}`}
                className={`w-full text-left p-4 transition-colors hover:bg-neutral-50 ${selected === u.unit_id ? "bg-neutral-50 border-l-4 border-[#E60012]" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display font-bold text-sm truncate">{u.name}</div>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${u.engine_on ? "bg-[#E60012] animate-pulse" : "bg-neutral-300"}`} />
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {u.site || "-"}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 font-mono text-[10px] text-neutral-600">
                  <div className="flex items-center gap-1"><Timer className="w-3 h-3" />{u.hm} HM</div>
                  <div className="flex items-center gap-1"><Gauge className="w-3 h-3" />{u.speed}</div>
                  <div className="flex items-center gap-1"><Fuel className="w-3 h-3" />{u.fuel_pct ?? "-"}%</div>
                </div>
              </button>
            ))}
            {!filtered.length && (
              <div className="p-6 text-center text-sm text-neutral-500">Tidak ada unit.</div>
            )}
          </div>
          {sel && (
            <div className="p-4 border-t bg-neutral-950 text-white">
              <div className="font-mono text-[9px] uppercase tracking-widest text-white/40 flex items-center gap-1">
                <Activity className="w-3 h-3" /> Riwayat pergerakan
              </div>
              <div className="font-display font-bold text-sm mt-1">{sel.name}</div>
              <div className="font-mono text-[10px] text-white/50 mt-1" data-testid="tracking-selected-info">
                {history.length} titik · terakhir {sel.recorded_at?.slice(11, 19)} UTC
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
