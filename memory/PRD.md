# SANY PERKASA — Enterprise CMS (PRD)

## Problem Statement
Content Management System tingkat perusahaan untuk **SANY PERKASA** (distributor alat berat).
Stack: FastAPI + React + MongoDB. Tema: industrial cinematic, SANY red (#E60012), high-contrast.
Storage: Emergent Object Storage. Bahasa UI: Indonesia.

## Roles
superadmin, sales_manager, warehouse_staff (RBAC + JWT).

## Implemented Modules
| Modul | Status | Tanggal |
|---|---|---|
| Auth JWT + RBAC + User Management | DONE | Jun 2026 |
| Katalog Unit (16 model SANY seed) | DONE | Jun 2026 |
| Suku Cadang + stock movement | DONE | Jun 2026 |
| CRM & Klien + interaksi | DONE | Jun 2026 |
| Quotation (PPN 11%) | DONE | Jun 2026 |
| Rental / Penyewaan Unit | DONE | Jun 2026 |
| Dasbor Analitik | DONE | Jun 2026 |
| Emergent Object Storage (/api/uploads) | DONE | Jun 2026 |
| Docker + docker-compose + ZIP export | DONE | Jun 2026 |
| **Manajemen Aset Real-Time (Leaflet/OSM, HM, riwayat pergerakan)** | DONE | 31 Aug 2026 |
| **Geofencing + notifikasi in-app & email (Resend managed)** | DONE | 31 Aug 2026 |
| **Permintaan Servis Instan (tracking mekanik + rating)** | DONE | 31 Aug 2026 |
| **Katalog Suku Cadang & Manual + pelacakan pengiriman** | DONE | 31 Aug 2026 |
| **Konsultasi Jarak Jauh RCS (Jitsi video/audio + chat + lampiran)** | DONE | 31 Aug 2026 |

## Key API Endpoints (baru)
- `POST /api/telemetry/ingest` — ingest GPS/HM (siap untuk perangkat GPS asli)
- `GET /api/tracking/units`, `GET /api/tracking/units/{id}/history`
- `GET/POST/PUT/DELETE /api/geofences`
- `GET /api/alerts`, `POST /api/alerts/{id}/read`, `POST /api/alerts/read-all`
- `GET/POST /api/service-requests`, `PUT .../status|assign|rating`, `GET /api/technicians`
- `GET/POST /api/part-orders`, `PUT /api/part-orders/{id}/status`
- `GET/POST /api/rcs/sessions`, `POST /api/rcs/sessions/{id}/messages`, `PUT .../status`

## Collections (baru)
telemetry, unit_state, geofences, geofence_state, geofence_alerts, email_throttle,
service_requests, part_orders, rcs_sessions

## Integrasi
- Emergent Object Storage (upload foto kerusakan & lampiran RCS)
- Emergent managed Resend (email peringatan geofence, throttle 10 menit/zona/unit)
- Leaflet + OpenStreetMap (tanpa API key)
- Jitsi Meet (room RCS, embed iframe)

## Aset Gambar (31 Aug 2026)
- Semua foto alat berat kini **foto asli unit SANY** dari Wikimedia Commons (lisensi bebas), diunduh & disimpan lokal di `/app/frontend/public/units/*.jpg` (width 1400, JPEG q82) — tidak hotlink, tidak AI-generated.
- Mapping model → file diatur di `seed_data()` (IMG_SMALL/IMG_MED/IMG_LARGE/IMG_RIG/IMG_LOADER) dan dipakai juga di Landing.jsx + Login.jsx.
- Catatan: foto drilling rig (`rig1.jpg`, `rig2.jpg`) adalah rotary drilling rig asli non-SANY karena Commons belum punya foto rig SANY.
- Favicon & logo: ikon panah SANY dari user (`favicon.ico`, `logo.png`, `logo192.png`, `logo512.png`).

## MOCKED / Simulasi
- Telemetry GPS **disimulasikan** server-side setiap 20 detik (`TELEMETRY_SIMULATION=true` di backend/.env). Perangkat GPS asli cukup POST ke `/api/telemetry/ingest`.
- Daftar teknisi RCS/servis = list statis di backend.
- Link repair manual mengarah ke sanyglobal.com (belum ada hosting PDF).

## Update 31 Aug 2026 — Upload Foto Unit
- Form Katalog Unit kini bisa **unggah foto dari perangkat** (PNG/JPG/JPEG/WEBP, multi-file, maks 10MB/file) ke Emergent Object Storage, dengan preview thumbnail + tombol hapus, dan tetap mendukung tempel URL manual.
- Endpoint baru `GET /api/public-files/{path}` (tanpa auth, cache 24 jam) agar `<img>` katalog bisa menampilkan foto hasil unggahan; `POST /api/uploads` sekarang mengembalikan `public_url`.

## Update 31 Aug 2026 — Galeri, Drag&Drop, Laporan Utilisasi, Responsif
- **Galeri multi-foto**: komponen `UnitGallery.jsx` — slider fade dengan tombol prev/next, dot indicator, counter (1/N) di setiap kartu katalog unit.
- **Drag & drop upload**: dropzone di form unit (PNG/JPG/JPEG/WEBP, multi-file, maks 10MB), preview thumbnail + hapus, tetap mendukung tempel URL.
- **Laporan Utilisasi** (`/app/reports`, `GET /api/reports/utilization?month=YYYY-MM`): jam kerja (HM) vs idle time per unit, % utilisasi, estimasi tagihan sewa (tarif_harian × jam_kerja/8), bar chart stacked (recharts), export CSV.
- **Responsif penuh**: PageHeader/StatCard skala bertahap, sidebar drawer + auto-close di mobile, tinggi peta/panel adaptif, tabel scroll horizontal. Terverifikasi 0 horizontal overflow di 390px & 768px pada semua halaman.
- Perbaikan dari test iterasi 3: validasi bulan `2026-99` kini 400 (bukan 500); tombol slider terlihat & fokusable di desktop.

## Backlog
- P1: Hosting PDF repair manual per unit/sparepart (Object Storage)
- P1: SSE/WebSocket menggantikan 3 polling interval (tracking 15s, geofence 20s, bell 20s)
- P2: Geofence polygon (saat ini circle), notifikasi WhatsApp
- P2: Pecah server.py (1400+ baris) menjadi router modular
- P2: Laporan PDF servis & invoice rental

## Testing
- `/app/test_reports/iteration_2.json` — backend 13/13 pass, frontend semua flow kritis pass, mobile 390px OK.
- Regression: `pytest /app/backend/tests/ -v`
