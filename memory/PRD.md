# PRD — SANY PERKASA CMS

## Original Problem Statement
Web aplikasi Content Management System (CMS) tingkat perusahaan untuk "SANY PERKASA" (perusahaan alat berat). Modul utama: Katalog Alat Berat (CRUD + spesifikasi teknis + galeri foto + status ketersediaan), Manajemen Spareparts (stok real-time, alert minimum, riwayat mutasi), CRM & Prospek (klien, interaksi, Quotation), Dasbor Analitik (tren penjualan, utilisasi unit, inventaris), Multi-Role RBAC (SuperAdmin/Sales Manager/Warehouse Staff), + Modul Rental/Penyewaan. Best practices keamanan (validasi, sanitasi, JWT). Tema mengikuti sanyglobal.com (SANY red #E60012), animasi & transisi masif.

## Architecture
- Frontend: React 19 + Tailwind + Framer Motion + Recharts + shadcn/ui (JSX)
- Backend: FastAPI (Motor async MongoDB), single `server.py` with `/api` prefix
- DB: MongoDB via MONGO_URL/DB_NAME env
- Auth: JWT (12h) — Bearer header + httpOnly cookie, bcrypt hashing
- Storage: Emergent Object Storage integrated (`/api/uploads`, `/api/files/{path}`)
- Seed: users (3 roles), 6 units, 8 spareparts, 4 clients, 4 quotations, 3 rentals — runs idempotently on startup

## User Personas
- SuperAdmin (j45t1n0505@gmail.com): full access + user management
- Sales Manager: units, clients, quotations, rentals, spareparts
- Warehouse Staff: spareparts & stock mutation only

## Implemented (2026-08-31)
- [x] Branding: logo SANY PERKASA asli di nav landing, login, sidebar dashboard + favicon (logo.png di public/)
- [x] Katalog sesuai lini resmi distributor: 12 Ekskavator (Small SY55C/SY75C/SY135C, Medium SY205C/SY215C, Large SY365H–SY2000H, Electric SY3000E), 3 Drilling Rig (SR235MV/SR285MV/SR405R), Wheel Loader SYL956H + field subkategori
- [x] Cinematic dark landing page (hero, stats, marquee partner, module grid, product bento, CTA) dengan Framer Motion masif
- [x] Login page (dark split layout) + JWT auth + Protected routes
- [x] Dashboard Overview: 6 stat cards, sales trend line chart, unit status donut, kategori bar chart, low-stock panel
- [x] Katalog Unit: CRUD modal (specs key:value, galeri URL, status), card grid
- [x] Spareparts: CRUD, stock in/out mutation dengan reason/reference, riwayat mutasi, low-stock badge
- [x] CRM: klien CRUD + riwayat interaksi (call/meeting/email/site_visit)
- [x] Quotation: multi-line builder (unit/sparepart/rental), auto subtotal + PPN 11% + total, status workflow draft→sent→accepted/rejected
- [x] Rental: kontrak (unit+klien+tanggal+tarif), auto days/total, status sync ke status unit (rented/available)
- [x] User Management (SuperAdmin only)
- [x] RBAC backend + frontend (sidebar menu filter per role)
- [x] Backend testing agent: 26/26 checks passed

## Credentials
See /app/memory/test_credentials.md

## Backlog (prioritized)
- P0: none blocking
- P1: UI file-upload ke object storage di form unit (saat ini via URL), filter/search di tabel, export PDF quotation
- P2: GPS/IoT tracking module (mock), service & maintenance schedule, notifikasi email low-stock

## Next Tasks
1. Tambahkan upload foto langsung dari browser (endpoint /api/uploads sudah siap)
2. GET /api/units/{id} single-fetch endpoint bila perlu detail page
