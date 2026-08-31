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

## MOCKED / Simulasi
- Telemetry GPS **disimulasikan** server-side setiap 20 detik (`TELEMETRY_SIMULATION=true` di backend/.env). Perangkat GPS asli cukup POST ke `/api/telemetry/ingest`.
- Daftar teknisi RCS/servis = list statis di backend.
- Link repair manual mengarah ke sanyglobal.com (belum ada hosting PDF).

## Backlog
- P0: Upload file (drag & drop) untuk form Katalog Unit (saat ini masih URL teks)
- P1: Hosting PDF repair manual per unit/sparepart (Object Storage)
- P1: SSE/WebSocket menggantikan 3 polling interval (tracking 15s, geofence 20s, bell 20s)
- P2: Geofence polygon (saat ini circle), notifikasi WhatsApp
- P2: Pecah server.py (1400+ baris) menjadi router modular
- P2: Laporan PDF servis & invoice rental

## Testing
- `/app/test_reports/iteration_2.json` — backend 13/13 pass, frontend semua flow kritis pass, mobile 390px OK.
- Regression: `pytest /app/backend/tests/ -v`
