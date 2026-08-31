# SANY PERKASA CMS

Web aplikasi Content Management System (CMS) tingkat perusahaan untuk distributor alat berat SANY PERKASA.

**Stack:** FastAPI + React 19 + MongoDB | JWT Auth + RBAC | Emergent Object Storage (opsional)

## Modul
- Katalog Alat Berat (CRUD, spesifikasi teknis, galeri, status ketersediaan)
- Suku Cadang / Spareparts (stok real-time, alert minimum, riwayat mutasi)
- CRM & Prospek (klien, riwayat interaksi, Quotation dengan PPN 11% otomatis)
- Rental / Penyewaan Unit (kontrak, jadwal, status-sync ke unit)
- Dasbor Analitik (tren penjualan, utilisasi unit, ringkasan inventaris)
- Multi-Role RBAC (SuperAdmin / Sales Manager / Warehouse Staff)

---

## A. Jalankan Lokal dengan Docker (paling mudah)

Prasyarat: Docker & Docker Compose terpasang.

```bash
docker compose up --build
```

Selesai:
- Frontend → http://localhost:3000
- Backend API → http://localhost:8001/api (docs: http://localhost:8001/docs)
- MongoDB → localhost:27017 (volume `mongo_data`, data persist)

Ubah kredensial admin & `JWT_SECRET` di `docker-compose.yml` sebelum production.

---

## B. Jalankan Lokal Manual (tanpa Docker)

Prasyarat: Python 3.11+, Node 18+, MongoDB berjalan di localhost:27017.

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # sesuaikan isi .env
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend
cp .env.example .env           # REACT_APP_BACKEND_URL=http://localhost:8001
yarn install
yarn start                     # dev server di http://localhost:3000
# atau untuk production build:
yarn build
```

Seed data (akun, katalog unit, sparepart, klien, quotation, rental) otomatis dibuat saat backend pertama kali start dan MongoDB masih kosong.

---

## C. Publish / Deployment

- **VPS / VM:** clone repo → `docker compose up -d --build` → arahkan reverse proxy (Nginx/Traefik + SSL Let's Encrypt) ke port 3000.
- **Vercel (frontend) + Railway/Fly (backend):** set `REACT_APP_BACKEND_URL` ke URL backend publik, jalankan `yarn build` di `frontend/`.
- **Backend di Railway/Fly/Render:** gunakan `backend/Dockerfile` atau start command `uvicorn server:app --host 0.0.0.0 --port $PORT`, set env dari `.env.example`, dan hubungkan MongoDB Atlas (`MONGO_URL`).

---

## Akun Default (seed)

| Role            | Email                        | Password            |
|-----------------|------------------------------|---------------------|
| SuperAdmin      | j45t1n0505@gmail.com         | SanyAdmin2026!      |
| Sales Manager   | sales@sanyperkasa.co.id      | SalesPass2026!      |
| Warehouse Staff | warehouse@sanyperkasa.co.id  | WarehousePass2026!  |

> Ganti password & `JWT_SECRET` sebelum production.

## Catatan
- Upload foto menggunakan Emergent Object Storage memerlukan env `EMERGENT_LLM_KEY`; tanpa key tersebut aplikasi tetap berfungsi normal (form unit memakai URL gambar).
- Semua endpoint API berprefix `/api`.
