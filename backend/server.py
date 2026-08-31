from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any

import bcrypt
import jwt
from bson import ObjectId
from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    Depends,
    Request,
    Response,
    UploadFile,
    File,
    Query,
    Header,
)
from fastapi.responses import Response as FastResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
import requests

# ---------------- MongoDB ----------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---------------- JWT ----------------
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

ROLES = ("superadmin", "sales_manager", "warehouse_staff")

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# ---------------- Object Storage ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "sanyperkasa"
storage_key: Optional[str] = None

def init_storage(force: bool = False) -> Optional[str]:
    global storage_key
    if storage_key and not force:
        return storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json().get("storage_key")
        return storage_key
    except Exception as e:
        logging.getLogger(__name__).warning(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 404:
        init_storage(force=True)
        key = storage_key
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage unavailable")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 404:
        init_storage(force=True)
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": storage_key},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ---------------- App ----------------
app = FastAPI(title="SANY PERKASA CMS")
api = APIRouter(prefix="/api")

# ---------------- Models ----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str

class UnitIn(BaseModel):
    name: str
    category: str  # Excavator / Dump Truck / Crane / Loader / Bulldozer
    model_code: str
    year: int
    price: float
    status: str = "available"  # available / rented / sold / maintenance
    description: Optional[str] = ""
    specs: dict = Field(default_factory=dict)
    images: List[str] = Field(default_factory=list)

class SparepartIn(BaseModel):
    sku: str
    name: str
    category: str
    unit_price: float
    stock: int
    min_stock: int
    location: Optional[str] = ""

class StockMoveIn(BaseModel):
    sparepart_id: str
    change: int  # positive in, negative out
    reason: str
    reference: Optional[str] = ""

class ClientIn(BaseModel):
    company: str
    contact_name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    industry: Optional[str] = ""
    notes: Optional[str] = ""

class InteractionIn(BaseModel):
    client_id: str
    kind: str  # call / meeting / email / site_visit
    summary: str

class QuotationLine(BaseModel):
    item_type: str  # unit / sparepart / rental
    item_id: Optional[str] = None
    description: str
    quantity: float
    unit_price: float

class QuotationIn(BaseModel):
    client_id: str
    lines: List[QuotationLine]
    status: str = "draft"  # draft / sent / accepted / rejected
    notes: Optional[str] = ""

class RentalIn(BaseModel):
    unit_id: str
    client_id: str
    start_date: str
    end_date: str
    daily_rate: float
    status: str = "scheduled"  # scheduled / active / completed / cancelled
    notes: Optional[str] = ""

# ---------------- Auth Dependency ----------------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_roles(*allowed: str):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed and user["role"] != "superadmin":
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return dep

# ---------------- Auth Routes ----------------
@api.post("/auth/login")
async def login(data: LoginIn, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=True, samesite="none", max_age=43200, path="/",
    )
    return {
        "token": token,
        "user": {
            "id": user["id"], "email": user["email"],
            "name": user["name"], "role": user["role"],
        },
    }

@api.post("/auth/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------------- User Management (SuperAdmin) ----------------
@api.get("/users")
async def list_users(_: dict = Depends(require_roles("superadmin"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users

@api.post("/users")
async def create_user(data: UserCreate, _: dict = Depends(require_roles("superadmin"))):
    if data.role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "id": new_id(), "email": email, "name": data.name,
        "role": data.role, "password_hash": hash_password(data.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, current: dict = Depends(require_roles("superadmin"))):
    if user_id == current["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    r = await db.users.delete_one({"id": user_id})
    return {"deleted": r.deleted_count}

# ---------------- Units (Katalog) ----------------
@api.get("/units")
async def list_units(_: dict = Depends(get_current_user)):
    return await db.units.find({}, {"_id": 0}).to_list(1000)

@api.get("/units/public")
async def list_units_public():
    return await db.units.find({}, {"_id": 0}).to_list(1000)

@api.post("/units")
async def create_unit(data: UnitIn, _: dict = Depends(require_roles("sales_manager"))):
    doc = {"id": new_id(), **data.model_dump(), "created_at": now_iso()}
    await db.units.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/units/{uid}")
async def update_unit(uid: str, data: UnitIn, _: dict = Depends(require_roles("sales_manager"))):
    await db.units.update_one({"id": uid}, {"$set": data.model_dump()})
    return await db.units.find_one({"id": uid}, {"_id": 0})

@api.delete("/units/{uid}")
async def delete_unit(uid: str, _: dict = Depends(require_roles("sales_manager"))):
    r = await db.units.delete_one({"id": uid})
    return {"deleted": r.deleted_count}

# ---------------- Spareparts ----------------
@api.get("/spareparts")
async def list_spareparts(_: dict = Depends(get_current_user)):
    return await db.spareparts.find({}, {"_id": 0}).to_list(2000)

@api.post("/spareparts")
async def create_sparepart(data: SparepartIn, _: dict = Depends(require_roles("warehouse_staff", "sales_manager"))):
    doc = {"id": new_id(), **data.model_dump(), "created_at": now_iso()}
    await db.spareparts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/spareparts/{sid}")
async def update_sparepart(sid: str, data: SparepartIn, _: dict = Depends(require_roles("warehouse_staff", "sales_manager"))):
    await db.spareparts.update_one({"id": sid}, {"$set": data.model_dump()})
    return await db.spareparts.find_one({"id": sid}, {"_id": 0})

@api.delete("/spareparts/{sid}")
async def delete_sparepart(sid: str, _: dict = Depends(require_roles("warehouse_staff", "sales_manager"))):
    r = await db.spareparts.delete_one({"id": sid})
    return {"deleted": r.deleted_count}

@api.post("/spareparts/move")
async def move_stock(data: StockMoveIn, user: dict = Depends(require_roles("warehouse_staff", "sales_manager"))):
    sp = await db.spareparts.find_one({"id": data.sparepart_id})
    if not sp:
        raise HTTPException(status_code=404, detail="Sparepart not found")
    new_stock = sp["stock"] + data.change
    if new_stock < 0:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    await db.spareparts.update_one({"id": data.sparepart_id}, {"$set": {"stock": new_stock}})
    log = {
        "id": new_id(), "sparepart_id": data.sparepart_id, "sparepart_name": sp["name"],
        "change": data.change, "reason": data.reason, "reference": data.reference,
        "user_id": user["id"], "user_name": user["name"],
        "created_at": now_iso(),
    }
    await db.stock_moves.insert_one(log)
    log.pop("_id", None)
    return {"sparepart_id": data.sparepart_id, "new_stock": new_stock, "move": log}

@api.get("/spareparts/moves")
async def list_moves(sparepart_id: Optional[str] = None, _: dict = Depends(get_current_user)):
    q = {"sparepart_id": sparepart_id} if sparepart_id else {}
    return await db.stock_moves.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

# ---------------- Clients ----------------
@api.get("/clients")
async def list_clients(_: dict = Depends(get_current_user)):
    return await db.clients.find({}, {"_id": 0}).to_list(2000)

@api.post("/clients")
async def create_client(data: ClientIn, _: dict = Depends(require_roles("sales_manager"))):
    doc = {"id": new_id(), **data.model_dump(), "created_at": now_iso()}
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/clients/{cid}")
async def update_client(cid: str, data: ClientIn, _: dict = Depends(require_roles("sales_manager"))):
    await db.clients.update_one({"id": cid}, {"$set": data.model_dump()})
    return await db.clients.find_one({"id": cid}, {"_id": 0})

@api.delete("/clients/{cid}")
async def delete_client(cid: str, _: dict = Depends(require_roles("sales_manager"))):
    r = await db.clients.delete_one({"id": cid})
    return {"deleted": r.deleted_count}

@api.post("/interactions")
async def add_interaction(data: InteractionIn, user: dict = Depends(require_roles("sales_manager"))):
    doc = {"id": new_id(), **data.model_dump(), "user_name": user["name"], "created_at": now_iso()}
    await db.interactions.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/interactions")
async def list_interactions(client_id: Optional[str] = None, _: dict = Depends(get_current_user)):
    q = {"client_id": client_id} if client_id else {}
    return await db.interactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

# ---------------- Quotations ----------------
@api.get("/quotations")
async def list_quotations(_: dict = Depends(get_current_user)):
    return await db.quotations.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api.post("/quotations")
async def create_quotation(data: QuotationIn, user: dict = Depends(require_roles("sales_manager"))):
    subtotal = sum(l.quantity * l.unit_price for l in data.lines)
    tax = round(subtotal * 0.11, 2)
    total = round(subtotal + tax, 2)
    doc = {
        "id": new_id(), "quote_no": f"QT-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{new_id()[:6].upper()}",
        **data.model_dump(), "subtotal": subtotal, "tax": tax, "total": total,
        "created_by": user["name"], "created_at": now_iso(),
    }
    await db.quotations.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/quotations/{qid}/status")
async def update_quote_status(qid: str, status: str, _: dict = Depends(require_roles("sales_manager"))):
    if status not in ("draft", "sent", "accepted", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")
    await db.quotations.update_one({"id": qid}, {"$set": {"status": status}})
    return await db.quotations.find_one({"id": qid}, {"_id": 0})

@api.delete("/quotations/{qid}")
async def delete_quotation(qid: str, _: dict = Depends(require_roles("sales_manager"))):
    r = await db.quotations.delete_one({"id": qid})
    return {"deleted": r.deleted_count}

# ---------------- Rentals ----------------
@api.get("/rentals")
async def list_rentals(_: dict = Depends(get_current_user)):
    return await db.rentals.find({}, {"_id": 0}).sort("start_date", -1).to_list(1000)

@api.post("/rentals")
async def create_rental(data: RentalIn, user: dict = Depends(require_roles("sales_manager"))):
    unit = await db.units.find_one({"id": data.unit_id})
    client_ = await db.clients.find_one({"id": data.client_id})
    if not unit or not client_:
        raise HTTPException(status_code=404, detail="Unit or client not found")
    days = max(1, (datetime.fromisoformat(data.end_date) - datetime.fromisoformat(data.start_date)).days)
    total = days * data.daily_rate
    doc = {
        "id": new_id(),
        "rental_no": f"RN-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{new_id()[:6].upper()}",
        **data.model_dump(),
        "unit_name": unit["name"], "client_name": client_["company"],
        "days": days, "total_amount": total,
        "created_by": user["name"], "created_at": now_iso(),
    }
    await db.rentals.insert_one(doc)
    if data.status == "active":
        await db.units.update_one({"id": data.unit_id}, {"$set": {"status": "rented"}})
    doc.pop("_id", None)
    return doc

@api.put("/rentals/{rid}/status")
async def update_rental_status(rid: str, status: str, _: dict = Depends(require_roles("sales_manager"))):
    if status not in ("scheduled", "active", "completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    r = await db.rentals.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Rental not found")
    await db.rentals.update_one({"id": rid}, {"$set": {"status": status}})
    if status == "active":
        await db.units.update_one({"id": r["unit_id"]}, {"$set": {"status": "rented"}})
    elif status in ("completed", "cancelled"):
        await db.units.update_one({"id": r["unit_id"]}, {"$set": {"status": "available"}})
    return await db.rentals.find_one({"id": rid}, {"_id": 0})

@api.delete("/rentals/{rid}")
async def delete_rental(rid: str, _: dict = Depends(require_roles("sales_manager"))):
    r = await db.rentals.delete_one({"id": rid})
    return {"deleted": r.deleted_count}

# ---------------- Analytics ----------------
@api.get("/analytics/summary")
async def analytics_summary(_: dict = Depends(get_current_user)):
    units = await db.units.find({}, {"_id": 0}).to_list(2000)
    spareparts = await db.spareparts.find({}, {"_id": 0}).to_list(5000)
    clients = await db.clients.count_documents({})
    quotes = await db.quotations.find({}, {"_id": 0}).to_list(2000)
    rentals = await db.rentals.find({}, {"_id": 0}).to_list(2000)

    units_by_status = {}
    for u in units:
        units_by_status[u["status"]] = units_by_status.get(u["status"], 0) + 1

    units_by_category = {}
    for u in units:
        units_by_category[u["category"]] = units_by_category.get(u["category"], 0) + 1

    low_stock = [s for s in spareparts if s["stock"] <= s["min_stock"]]

    # Sales trend by month from accepted quotes
    trend = {}
    for q in quotes:
        if q.get("status") == "accepted":
            month = q["created_at"][:7]
            trend[month] = trend.get(month, 0) + q.get("total", 0)
    sales_trend = [{"month": m, "amount": v} for m, v in sorted(trend.items())]

    rev_pending = sum(q.get("total", 0) for q in quotes if q.get("status") == "sent")
    rev_accepted = sum(q.get("total", 0) for q in quotes if q.get("status") == "accepted")
    rental_revenue = sum(r.get("total_amount", 0) for r in rentals if r.get("status") in ("active", "completed"))

    return {
        "totals": {
            "units": len(units),
            "spareparts": len(spareparts),
            "clients": clients,
            "quotations": len(quotes),
            "rentals": len(rentals),
            "low_stock": len(low_stock),
        },
        "units_by_status": units_by_status,
        "units_by_category": units_by_category,
        "revenue": {
            "pending": rev_pending,
            "accepted": rev_accepted,
            "rentals": rental_revenue,
        },
        "sales_trend": sales_trend,
        "low_stock_items": low_stock[:10],
    }

# ---------------- Uploads ----------------
@api.post("/uploads")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    await db.files.insert_one({
        "id": new_id(),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result["size"],
        "owner_id": user["id"],
        "is_deleted": False,
        "created_at": now_iso(),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}

@api.get("/files/{path:path}")
async def download_file(path: str, auth: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    # Auth check - allow via header or query token
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, ct = get_object(path)
    return FastResponse(content=data, media_type=record.get("content_type", ct))

# ---------------- Seed ----------------
async def seed_data():
    # Users
    seeds = [
        {"email": os.environ.get("ADMIN_EMAIL", "admin@sanyperkasa.co.id"),
         "password": os.environ.get("ADMIN_PASSWORD", "SanyAdmin2026!"),
         "name": "SANY Perkasa Owner", "role": "superadmin"},
        {"email": "sales@sanyperkasa.co.id", "password": "SalesPass2026!",
         "name": "Rina Sales Manager", "role": "sales_manager"},
        {"email": "warehouse@sanyperkasa.co.id", "password": "WarehousePass2026!",
         "name": "Budi Warehouse", "role": "warehouse_staff"},
    ]
    for s in seeds:
        email = s["email"].lower()
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({
                "id": new_id(), "email": email, "name": s["name"],
                "role": s["role"], "password_hash": hash_password(s["password"]),
                "created_at": now_iso(),
            })
        elif not verify_password(s["password"], existing["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(s["password"])}})

    # Units
    if await db.units.count_documents({}) == 0:
        units_seed = [
            {"name": "SANY SY215C Excavator", "category": "Excavator", "model_code": "SY215C",
             "year": 2024, "price": 1850000000, "status": "available",
             "description": "Ekskavator 21.5 ton, cocok untuk pertambangan dan konstruksi berat.",
             "specs": {"operating_weight": "21500 kg", "bucket_capacity": "1.0 m³",
                       "engine": "Isuzu 4HK1X", "power": "129 kW", "max_dig_depth": "6720 mm"},
             "images": ["https://images.unsplash.com/photo-1630288214173-a119cf823388?w=1200"]},
            {"name": "SANY SY365H Excavator", "category": "Excavator", "model_code": "SY365H",
             "year": 2024, "price": 2650000000, "status": "rented",
             "description": "Ekskavator 36.5 ton untuk aplikasi berat & tambang.",
             "specs": {"operating_weight": "36500 kg", "bucket_capacity": "1.9 m³",
                       "engine": "Mitsubishi 6D34", "power": "202 kW", "max_dig_depth": "7420 mm"},
             "images": ["https://images.unsplash.com/photo-1575281923032-f40d94ef6160?w=1200"]},
            {"name": "SANY SKT90S Dump Truck", "category": "Dump Truck", "model_code": "SKT90S",
             "year": 2023, "price": 4200000000, "status": "available",
             "description": "Mining dump truck kapasitas 60 ton.",
             "specs": {"payload": "60 t", "engine": "Cummins QSK19",
                       "power": "597 kW", "top_speed": "60 km/h"},
             "images": ["https://images.unsplash.com/photo-1573497019236-17f8177b81e8?w=1200"]},
            {"name": "SANY STC750 Truck Crane", "category": "Crane", "model_code": "STC750",
             "year": 2024, "price": 5800000000, "status": "available",
             "description": "Truck crane kapasitas angkat 75 ton, boom 47m.",
             "specs": {"max_lift": "75 t", "boom_length": "47 m",
                       "engine": "Weichai", "counterweight": "22 t"},
             "images": ["https://images.unsplash.com/photo-1581094488379-6a10d04c0f04?w=1200"]},
            {"name": "SANY SY75C Mini Excavator", "category": "Excavator", "model_code": "SY75C",
             "year": 2024, "price": 780000000, "status": "maintenance",
             "description": "Mini ekskavator 7.5 ton untuk kerja perkotaan.",
             "specs": {"operating_weight": "7500 kg", "bucket_capacity": "0.32 m³",
                       "engine": "Yanmar", "power": "45 kW"},
             "images": ["https://images.unsplash.com/photo-1611024847416-e552edf88ecd?w=1200"]},
            {"name": "SANY SW956K Wheel Loader", "category": "Loader", "model_code": "SW956K",
             "year": 2024, "price": 1450000000, "status": "available",
             "description": "Wheel loader 5 ton, ideal untuk quarry & konstruksi.",
             "specs": {"bucket_capacity": "3.0 m³", "rated_load": "5000 kg",
                       "engine": "Weichai WD10G220E23", "power": "162 kW"},
             "images": ["https://images.unsplash.com/photo-1553969923-bbf0cac2666b?w=1200"]},
        ]
        for u in units_seed:
            await db.units.insert_one({"id": new_id(), **u, "created_at": now_iso()})

    # Spareparts
    if await db.spareparts.count_documents({}) == 0:
        sp_seed = [
            {"sku": "SP-FLT-001", "name": "Oil Filter SY215C", "category": "Filter", "unit_price": 350000, "stock": 45, "min_stock": 10, "location": "Rack A1"},
            {"sku": "SP-FLT-002", "name": "Fuel Filter SY365H", "category": "Filter", "unit_price": 420000, "stock": 8, "min_stock": 10, "location": "Rack A1"},
            {"sku": "SP-HYD-101", "name": "Hydraulic Pump Assy", "category": "Hydraulic", "unit_price": 24500000, "stock": 3, "min_stock": 2, "location": "Rack B3"},
            {"sku": "SP-UND-201", "name": "Track Chain 39L", "category": "Undercarriage", "unit_price": 18700000, "stock": 12, "min_stock": 4, "location": "Yard C"},
            {"sku": "SP-ENG-301", "name": "Turbocharger Isuzu 4HK1X", "category": "Engine", "unit_price": 32000000, "stock": 2, "min_stock": 3, "location": "Rack D2"},
            {"sku": "SP-ELE-401", "name": "Starter Motor 24V", "category": "Electrical", "unit_price": 4800000, "stock": 15, "min_stock": 5, "location": "Rack E1"},
            {"sku": "SP-TYR-501", "name": "OTR Tire 23.5R25", "category": "Tire", "unit_price": 27500000, "stock": 6, "min_stock": 4, "location": "Yard C"},
            {"sku": "SP-CAB-601", "name": "Cabin Air Filter", "category": "Filter", "unit_price": 275000, "stock": 60, "min_stock": 20, "location": "Rack A2"},
        ]
        for s in sp_seed:
            await db.spareparts.insert_one({"id": new_id(), **s, "created_at": now_iso()})

    # Clients
    if await db.clients.count_documents({}) == 0:
        cl_seed = [
            {"company": "PT Adaro Energy", "contact_name": "Bapak Hendra", "email": "hendra@adaro.co.id",
             "phone": "+62 811 2345 111", "address": "South Kalimantan", "industry": "Mining", "notes": "Long-term partner."},
            {"company": "PT Wijaya Karya", "contact_name": "Ibu Sinta", "email": "sinta@wika.co.id",
             "phone": "+62 812 4455 222", "address": "Jakarta Pusat", "industry": "Construction", "notes": "Toll road project."},
            {"company": "PT Kideco Jaya Agung", "contact_name": "Bapak Rizky", "email": "rizky@kideco.co.id",
             "phone": "+62 813 7788 333", "address": "East Kalimantan", "industry": "Mining", "notes": "Coal mining ops."},
            {"company": "PT Waskita Karya", "contact_name": "Ibu Maya", "email": "maya@waskita.co.id",
             "phone": "+62 814 6677 444", "address": "Jakarta Selatan", "industry": "Infrastructure", "notes": "Bridge & dam."},
        ]
        for c in cl_seed:
            await db.clients.insert_one({"id": new_id(), **c, "created_at": now_iso()})

    # Quotations
    if await db.quotations.count_documents({}) == 0:
        clients_list = await db.clients.find({}, {"_id": 0}).to_list(10)
        units_list = await db.units.find({}, {"_id": 0}).to_list(10)
        base = datetime.now(timezone.utc)
        for i, c in enumerate(clients_list):
            if not units_list:
                break
            u = units_list[i % len(units_list)]
            subtotal = u["price"]
            tax = round(subtotal * 0.11, 2)
            total = round(subtotal + tax, 2)
            status = ["accepted", "sent", "accepted", "rejected"][i % 4]
            created = (base - timedelta(days=(i + 1) * 25)).isoformat()
            await db.quotations.insert_one({
                "id": new_id(),
                "quote_no": f"QT-SEED-{i+1:04d}",
                "client_id": c["id"],
                "lines": [{"item_type": "unit", "item_id": u["id"], "description": u["name"],
                           "quantity": 1, "unit_price": u["price"]}],
                "status": status, "notes": "",
                "subtotal": subtotal, "tax": tax, "total": total,
                "created_by": "Rina Sales Manager",
                "created_at": created,
            })

    # Rentals
    if await db.rentals.count_documents({}) == 0:
        clients_list = await db.clients.find({}, {"_id": 0}).to_list(10)
        units_list = await db.units.find({}, {"_id": 0}).to_list(10)
        base = datetime.now(timezone.utc)
        samples = [
            {"days": 30, "rate": 8500000, "status": "active"},
            {"days": 14, "rate": 12000000, "status": "completed"},
            {"days": 45, "rate": 6500000, "status": "scheduled"},
        ]
        for i, s in enumerate(samples):
            if i >= len(clients_list) or i >= len(units_list):
                break
            c = clients_list[i]
            u = units_list[i]
            start = base + timedelta(days=(i - 1) * 20)
            end = start + timedelta(days=s["days"])
            await db.rentals.insert_one({
                "id": new_id(),
                "rental_no": f"RN-SEED-{i+1:04d}",
                "unit_id": u["id"], "unit_name": u["name"],
                "client_id": c["id"], "client_name": c["company"],
                "start_date": start.isoformat(), "end_date": end.isoformat(),
                "daily_rate": s["rate"], "days": s["days"],
                "total_amount": s["rate"] * s["days"],
                "status": s["status"], "notes": "",
                "created_by": "Rina Sales Manager",
                "created_at": base.isoformat(),
            })

@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.units.create_index("id", unique=True)
    await db.spareparts.create_index("sku")
    init_storage()
    await seed_data()

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
