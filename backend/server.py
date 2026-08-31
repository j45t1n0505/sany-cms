from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import math
import random
import asyncio
import ipaddress
import uuid
import logging
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any

import bcrypt
import httpx
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
    category: str  # Excavator / Drilling Rig / Wheel Loader
    subcategory: Optional[str] = ""
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

# ================= EMAIL (Emergent managed Resend) =================
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "SANY PERKASA")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    if not EMAIL_KEY:
        logging.getLogger(__name__).warning("EMERGENT_EMAIL_KEY missing; email skipped")
        return None
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as hc:
            resp = await hc.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logging.getLogger(__name__).error(f"Email send error: {e}")
        return None


def _geofence_alert_html(unit_name: str, fence_name: str, event: str, lat: float, lng: float, when: str) -> str:
    ev = "KELUAR dari" if event == "exit" else "MASUK ke"
    return (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#111">'
        f'<div style="background:#E60012;color:#fff;padding:12px 16px;font-weight:bold">PERINGATAN GEOFENCE</div>'
        f'<p>Unit <strong>{escape(unit_name)}</strong> terdeteksi <strong>{ev}</strong> area '
        f'<strong>{escape(fence_name)}</strong>.</p>'
        f'<p style="font-family:monospace;font-size:13px">Koordinat: {lat:.5f}, {lng:.5f}<br/>Waktu: {escape(when)}</p>'
        f'<p>Silakan buka dasbor Manajemen Aset Real-Time pada aplikasi CMS untuk melihat detail pergerakan unit.</p>'
        f'<p style="font-size:12px;color:#888">Dikirim otomatis oleh {escape(EMAIL_FROM_NAME)} CMS. '
        f'Kami tidak pernah meminta kata sandi Anda melalui email.</p>'
        '</td></tr></table>'
    )


# ================= REAL-TIME ASSET MANAGEMENT / TELEMETRY =================
class TelemetryIn(BaseModel):
    unit_id: str
    lat: float
    lng: float
    hm: Optional[float] = None
    speed: float = 0
    heading: float = 0
    engine_on: bool = True
    fuel_pct: Optional[float] = None


class GeofenceIn(BaseModel):
    name: str
    unit_id: Optional[str] = None  # None = semua unit
    center_lat: float
    center_lng: float
    radius_m: float
    alert_on: str = "both"  # enter / exit / both
    active: bool = True
    notify_email: Optional[str] = None


def haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def record_telemetry(unit_id: str, lat: float, lng: float, hm: float, speed: float,
                           heading: float, engine_on: bool, fuel_pct: Optional[float]) -> dict:
    unit = await db.units.find_one({"id": unit_id}, {"_id": 0, "name": 1, "id": 1})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    point = {
        "id": new_id(), "unit_id": unit_id, "unit_name": unit["name"],
        "lat": lat, "lng": lng, "hm": hm, "speed": speed, "heading": heading,
        "engine_on": engine_on, "fuel_pct": fuel_pct, "recorded_at": now_iso(),
    }
    await db.telemetry.insert_one(dict(point))
    await db.unit_state.update_one(
        {"unit_id": unit_id},
        {"$set": {k: v for k, v in point.items() if k != "id"}},
        upsert=True,
    )
    await evaluate_geofences(unit_id, unit["name"], lat, lng)
    point.pop("_id", None)
    return point


async def evaluate_geofences(unit_id: str, unit_name: str, lat: float, lng: float):
    fences = await db.geofences.find(
        {"active": True, "$or": [{"unit_id": unit_id}, {"unit_id": None}]}, {"_id": 0}
    ).to_list(200)
    for f in fences:
        dist = haversine_m(lat, lng, f["center_lat"], f["center_lng"])
        inside = dist <= f["radius_m"]
        key = f"{f['id']}::{unit_id}"
        prev = await db.geofence_state.find_one({"key": key})
        was_inside = prev["inside"] if prev else inside
        await db.geofence_state.update_one({"key": key}, {"$set": {"inside": inside}}, upsert=True)
        if prev is None or was_inside == inside:
            continue
        event = "enter" if inside else "exit"
        if f.get("alert_on", "both") not in ("both", event):
            continue
        alert = {
            "id": new_id(), "geofence_id": f["id"], "geofence_name": f["name"],
            "unit_id": unit_id, "unit_name": unit_name, "event": event,
            "lat": lat, "lng": lng, "distance_m": round(dist), "read": False,
            "created_at": now_iso(),
        }
        await db.geofence_alerts.insert_one(dict(alert))
        to = f.get("notify_email") or os.environ.get("ADMIN_EMAIL")
        if to:
            last = await db.email_throttle.find_one({"key": key})
            now_dt = datetime.now(timezone.utc)
            recent = last and (now_dt - datetime.fromisoformat(last["at"])).total_seconds() < 600
            if not recent:
                await db.email_throttle.update_one({"key": key}, {"$set": {"at": now_dt.isoformat()}}, upsert=True)
                await send_email(
                to=to,
                    subject=f"[SANY PERKASA] Peringatan Geofence: {unit_name} {event.upper()} {f['name']}",
                    html=_geofence_alert_html(unit_name, f["name"], event, lat, lng, alert["created_at"]),
                )


@api.post("/telemetry/ingest")
async def ingest_telemetry(data: TelemetryIn, _: dict = Depends(get_current_user)):
    state = await db.unit_state.find_one({"unit_id": data.unit_id}, {"_id": 0})
    hm = data.hm if data.hm is not None else (state or {}).get("hm", 0)
    return await record_telemetry(data.unit_id, data.lat, data.lng, hm, data.speed,
                                 data.heading, data.engine_on, data.fuel_pct)


@api.get("/tracking/units")
async def tracking_units(_: dict = Depends(get_current_user)):
    units = await db.units.find({}, {"_id": 0}).to_list(1000)
    states = {s["unit_id"]: s for s in await db.unit_state.find({}, {"_id": 0}).to_list(2000)}
    out = []
    for u in units:
        s = states.get(u["id"])
        if not s:
            continue
        out.append({
            "unit_id": u["id"], "name": u["name"], "model_code": u.get("model_code"),
            "category": u.get("category"), "status": u.get("status"),
            "image": (u.get("images") or [None])[0],
            "lat": s["lat"], "lng": s["lng"], "hm": round(s.get("hm", 0), 1),
            "speed": s.get("speed", 0), "heading": s.get("heading", 0),
            "engine_on": s.get("engine_on", False), "fuel_pct": s.get("fuel_pct"),
            "recorded_at": s.get("recorded_at"),
            "site": s.get("site", ""),
        })
    return out


@api.get("/tracking/units/{unit_id}/history")
async def tracking_history(unit_id: str, limit: int = 200, _: dict = Depends(get_current_user)):
    rows = await db.telemetry.find({"unit_id": unit_id}, {"_id": 0}).sort("recorded_at", -1).to_list(limit)
    return list(reversed(rows))


@api.get("/geofences")
async def list_geofences(_: dict = Depends(get_current_user)):
    return await db.geofences.find({}, {"_id": 0}).to_list(500)


@api.post("/geofences")
async def create_geofence(data: GeofenceIn, _: dict = Depends(require_roles("sales_manager", "warehouse_staff"))):
    doc = {"id": new_id(), **data.model_dump(), "created_at": now_iso()}
    await db.geofences.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.put("/geofences/{gid}")
async def update_geofence(gid: str, data: GeofenceIn, _: dict = Depends(require_roles("sales_manager", "warehouse_staff"))):
    await db.geofences.update_one({"id": gid}, {"$set": data.model_dump()})
    return await db.geofences.find_one({"id": gid}, {"_id": 0})


@api.delete("/geofences/{gid}")
async def delete_geofence(gid: str, _: dict = Depends(require_roles("sales_manager", "warehouse_staff"))):
    r = await db.geofences.delete_one({"id": gid})
    await db.geofence_state.delete_many({"key": {"$regex": f"^{gid}::"}})
    return {"deleted": r.deleted_count}


@api.get("/alerts")
async def list_alerts(unread_only: bool = False, _: dict = Depends(get_current_user)):
    q = {"read": False} if unread_only else {}
    return await db.geofence_alerts.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/alerts/{aid}/read")
async def read_alert(aid: str, _: dict = Depends(get_current_user)):
    await db.geofence_alerts.update_one({"id": aid}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/alerts/read-all")
async def read_all_alerts(_: dict = Depends(get_current_user)):
    r = await db.geofence_alerts.update_many({"read": False}, {"$set": {"read": True}})
    return {"updated": r.modified_count}


# ================= SERVICE & MAINTENANCE =================
SERVICE_FLOW = ["submitted", "assigned", "on_the_way", "in_progress", "completed", "closed"]

TECHNICIANS = [
    {"name": "Agus Priyanto", "phone": "+62 811 9001 221", "specialty": "Hydraulic & Undercarriage"},
    {"name": "Dedi Kurniawan", "phone": "+62 812 9002 332", "specialty": "Engine & Powertrain"},
    {"name": "Feri Santoso", "phone": "+62 813 9003 443", "specialty": "Electrical & ECU"},
]


class ServiceRequestIn(BaseModel):
    unit_id: str
    client_id: Optional[str] = None
    issue_type: str  # engine / hydraulic / electrical / undercarriage / periodic
    priority: str = "normal"  # low / normal / high / emergency
    description: str
    location: Optional[str] = ""
    contact_phone: Optional[str] = ""
    photos: List[str] = Field(default_factory=list)


class ServiceRatingIn(BaseModel):
    rating: int
    review: Optional[str] = ""


@api.get("/service-requests")
async def list_service_requests(_: dict = Depends(get_current_user)):
    return await db.service_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/service-requests")
async def create_service_request(data: ServiceRequestIn, user: dict = Depends(get_current_user)):
    unit = await db.units.find_one({"id": data.unit_id}, {"_id": 0})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    client_name = ""
    if data.client_id:
        c = await db.clients.find_one({"id": data.client_id}, {"_id": 0})
        client_name = c["company"] if c else ""
    ts = now_iso()
    doc = {
        "id": new_id(),
        "ticket_no": f"SVC-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{new_id()[:5].upper()}",
        **data.model_dump(),
        "unit_name": unit["name"], "client_name": client_name,
        "status": "submitted", "technician": None,
        "timeline": [{"status": "submitted", "note": "Permintaan servis diterima sistem", "at": ts}],
        "rating": None, "review": "",
        "requested_by": user["name"], "requested_by_id": user["id"],
        "created_at": ts, "updated_at": ts,
    }
    await db.service_requests.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.put("/service-requests/{sid}/status")
async def update_service_status(sid: str, status: str, note: str = "",
                                user: dict = Depends(require_roles("warehouse_staff", "sales_manager"))):
    if status not in SERVICE_FLOW:
        raise HTTPException(status_code=400, detail="Invalid status")
    sr = await db.service_requests.find_one({"id": sid})
    if not sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    ts = now_iso()
    await db.service_requests.update_one(
        {"id": sid},
        {"$set": {"status": status, "updated_at": ts},
         "$push": {"timeline": {"status": status, "note": note or f"Status diubah oleh {user['name']}", "at": ts}}},
    )
    return await db.service_requests.find_one({"id": sid}, {"_id": 0})


@api.put("/service-requests/{sid}/assign")
async def assign_technician(sid: str, technician_name: str,
                            user: dict = Depends(require_roles("warehouse_staff", "sales_manager"))):
    tech = next((t for t in TECHNICIANS if t["name"] == technician_name), None)
    if not tech:
        raise HTTPException(status_code=400, detail="Unknown technician")
    ts = now_iso()
    sr = await db.service_requests.find_one({"id": sid})
    if not sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    await db.service_requests.update_one(
        {"id": sid},
        {"$set": {"technician": tech, "status": "assigned", "updated_at": ts},
         "$push": {"timeline": {"status": "assigned", "note": f"Mekanik {tech['name']} ditugaskan", "at": ts}}},
    )
    return await db.service_requests.find_one({"id": sid}, {"_id": 0})


@api.put("/service-requests/{sid}/rating")
async def rate_service(sid: str, data: ServiceRatingIn, user: dict = Depends(get_current_user)):
    if not 1 <= data.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating harus 1-5")
    sr = await db.service_requests.find_one({"id": sid})
    if not sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    if sr["status"] not in ("completed", "closed"):
        raise HTTPException(status_code=400, detail="Servis belum selesai")
    await db.service_requests.update_one(
        {"id": sid},
        {"$set": {"rating": data.rating, "review": data.review, "status": "closed", "updated_at": now_iso()},
         "$push": {"timeline": {"status": "closed", "note": f"Dinilai {data.rating}/5 oleh {user['name']}", "at": now_iso()}}},
    )
    return await db.service_requests.find_one({"id": sid}, {"_id": 0})


@api.get("/technicians")
async def list_technicians(_: dict = Depends(get_current_user)):
    return TECHNICIANS


# ================= PART ORDERS & SHIPMENT TRACKING =================
SHIPMENT_FLOW = ["ordered", "packed", "shipped", "in_transit", "delivered"]


class PartOrderIn(BaseModel):
    sparepart_id: str
    quantity: int
    client_id: Optional[str] = None
    destination: str
    notes: Optional[str] = ""


@api.get("/part-orders")
async def list_part_orders(_: dict = Depends(get_current_user)):
    return await db.part_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/part-orders")
async def create_part_order(data: PartOrderIn, user: dict = Depends(get_current_user)):
    sp = await db.spareparts.find_one({"id": data.sparepart_id}, {"_id": 0})
    if not sp:
        raise HTTPException(status_code=404, detail="Sparepart not found")
    if data.quantity < 1:
        raise HTTPException(status_code=400, detail="Kuantitas minimal 1")
    client_name = ""
    if data.client_id:
        c = await db.clients.find_one({"id": data.client_id}, {"_id": 0})
        client_name = c["company"] if c else ""
    subtotal = sp["unit_price"] * data.quantity
    tax = round(subtotal * 0.11, 2)
    ts = now_iso()
    doc = {
        "id": new_id(),
        "order_no": f"PO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{new_id()[:5].upper()}",
        **data.model_dump(),
        "sparepart_name": sp["name"], "sku": sp["sku"], "unit_price": sp["unit_price"],
        "client_name": client_name,
        "subtotal": subtotal, "tax": tax, "total": round(subtotal + tax, 2),
        "status": "ordered",
        "tracking_no": f"SPX{new_id()[:10].upper()}",
        "eta": (datetime.now(timezone.utc) + timedelta(days=4)).isoformat(),
        "timeline": [{"status": "ordered", "note": "Pesanan diterima", "at": ts}],
        "created_by": user["name"], "created_at": ts,
    }
    await db.part_orders.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.put("/part-orders/{oid}/status")
async def update_part_order_status(oid: str, status: str,
                                  user: dict = Depends(require_roles("warehouse_staff", "sales_manager"))):
    if status not in SHIPMENT_FLOW:
        raise HTTPException(status_code=400, detail="Invalid status")
    ts = now_iso()
    o = await db.part_orders.find_one({"id": oid})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    await db.part_orders.update_one(
        {"id": oid},
        {"$set": {"status": status},
         "$push": {"timeline": {"status": status, "note": f"Diperbarui oleh {user['name']}", "at": ts}}},
    )
    return await db.part_orders.find_one({"id": oid}, {"_id": 0})


# ================= RCS — REMOTE CONSULTATION =================
class RcsSessionIn(BaseModel):
    topic: str
    unit_id: Optional[str] = None
    technician_name: Optional[str] = ""
    mode: str = "video"  # video / audio
    scheduled_at: Optional[str] = None
    description: Optional[str] = ""


class RcsMessageIn(BaseModel):
    text: Optional[str] = ""
    attachment_url: Optional[str] = None
    attachment_type: Optional[str] = None


@api.get("/rcs/sessions")
async def list_rcs(_: dict = Depends(get_current_user)):
    return await db.rcs_sessions.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


@api.post("/rcs/sessions")
async def create_rcs(data: RcsSessionIn, user: dict = Depends(get_current_user)):
    unit_name = ""
    if data.unit_id:
        u = await db.units.find_one({"id": data.unit_id}, {"_id": 0})
        unit_name = u["name"] if u else ""
    room = f"SANYPERKASA-RCS-{new_id()[:8].upper()}"
    doc = {
        "id": new_id(), **data.model_dump(), "unit_name": unit_name,
        "room_name": room, "room_url": f"https://meet.jit.si/{room}",
        "status": "scheduled" if data.scheduled_at else "open",
        "messages": [],
        "created_by": user["name"], "created_by_id": user["id"], "created_at": now_iso(),
    }
    await db.rcs_sessions.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.post("/rcs/sessions/{sid}/messages")
async def add_rcs_message(sid: str, data: RcsMessageIn, user: dict = Depends(get_current_user)):
    s = await db.rcs_sessions.find_one({"id": sid})
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if not (data.text or data.attachment_url):
        raise HTTPException(status_code=400, detail="Pesan kosong")
    msg = {
        "id": new_id(), "text": data.text or "", "attachment_url": data.attachment_url,
        "attachment_type": data.attachment_type, "author": user["name"],
        "author_role": user["role"], "at": now_iso(),
    }
    await db.rcs_sessions.update_one({"id": sid}, {"$push": {"messages": msg}})
    return msg


@api.put("/rcs/sessions/{sid}/status")
async def update_rcs_status(sid: str, status: str, _: dict = Depends(get_current_user)):
    if status not in ("scheduled", "open", "live", "closed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    await db.rcs_sessions.update_one({"id": sid}, {"$set": {"status": status}})
    return await db.rcs_sessions.find_one({"id": sid}, {"_id": 0})


# ================= TELEMETRY SIMULATOR =================
SITES = [
    {"name": "Tambang Tabalong, Kalsel", "lat": -2.2050, "lng": 115.4000},
    {"name": "Proyek Tol Cisumdawu, Jabar", "lat": -6.8400, "lng": 107.9500},
    {"name": "Site Kideco, Paser Kaltim", "lat": -1.8500, "lng": 116.0500},
    {"name": "Bendungan Karian, Banten", "lat": -6.4700, "lng": 106.2400},
    {"name": "Quarry Rumpin, Bogor", "lat": -6.4200, "lng": 106.6300},
]


async def seed_telemetry():
    if await db.unit_state.count_documents({}) > 0:
        return
    units = await db.units.find({}, {"_id": 0}).to_list(100)
    for i, u in enumerate(units):
        site = SITES[i % len(SITES)]
        lat = site["lat"] + random.uniform(-0.02, 0.02)
        lng = site["lng"] + random.uniform(-0.02, 0.02)
        hm = round(random.uniform(120, 8200), 1)
        engine = u.get("status") in ("rented", "available") and random.random() > 0.35
        await db.unit_state.update_one(
            {"unit_id": u["id"]},
            {"$set": {
                "unit_id": u["id"], "unit_name": u["name"], "lat": lat, "lng": lng, "hm": hm,
                "speed": round(random.uniform(0, 6), 1) if engine else 0,
                "heading": random.uniform(0, 360), "engine_on": engine,
                "fuel_pct": round(random.uniform(25, 98), 1),
                "site": site["name"], "recorded_at": now_iso(),
            }},
            upsert=True,
        )
        await db.telemetry.insert_one({
            "id": new_id(), "unit_id": u["id"], "unit_name": u["name"], "lat": lat, "lng": lng,
            "hm": hm, "speed": 0, "heading": 0, "engine_on": engine, "fuel_pct": 80,
            "recorded_at": now_iso(),
        })


async def seed_geofences():
    if await db.geofences.count_documents({}) > 0:
        return
    for s in SITES[:3]:
        await db.geofences.insert_one({
            "id": new_id(), "name": f"Zona {s['name']}", "unit_id": None,
            "center_lat": s["lat"], "center_lng": s["lng"], "radius_m": 3000,
            "alert_on": "both", "active": True,
            "notify_email": os.environ.get("ADMIN_EMAIL"),
            "created_at": now_iso(),
        })


async def telemetry_simulator():
    while True:
        try:
            await asyncio.sleep(20)
            states = await db.unit_state.find({"engine_on": True}, {"_id": 0}).to_list(200)
            for s in states:
                heading = (s.get("heading", 0) + random.uniform(-35, 35)) % 360
                dist = random.uniform(40, 260)  # meter per tick
                dlat = (dist * math.cos(math.radians(heading))) / 111320
                dlng = (dist * math.sin(math.radians(heading))) / (111320 * math.cos(math.radians(s["lat"])))
                hm = round(s.get("hm", 0) + 20 / 3600, 3)
                fuel = max(3, round((s.get("fuel_pct") or 80) - random.uniform(0.02, 0.15), 2))
                await record_telemetry(
                    s["unit_id"], s["lat"] + dlat, s["lng"] + dlng, hm,
                    round(random.uniform(1, 9), 1), heading, True, fuel,
                )
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logging.getLogger(__name__).warning(f"Simulator tick failed: {e}")


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
        IMG_SMALL = "/units/sy55c.jpg"
        IMG_MED = "/units/sy215c.jpg"
        IMG_MED2 = "/units/med1.jpg"
        IMG_LARGE = "/units/large1.jpg"
        IMG_LARGE2 = "/units/large3.jpg"
        IMG_ELECTRIC = "/units/large2.jpg"
        IMG_RIG = "/units/rig1.jpg"
        IMG_RIG2 = "/units/rig2.jpg"
        IMG_LOADER = "/units/loader.jpg"
        units_seed = [
            {"name": "SANY SY55C", "category": "Excavator", "subcategory": "Small Excavator", "model_code": "SY55C",
             "year": 2025, "price": 685000000, "status": "available",
             "description": "Mini ekskavator 5.5 ton untuk konstruksi ringan dan lanskap.",
             "specs": {"operating_weight": "5780 kg", "bucket_capacity": "0.21 m³", "engine": "Yanmar 4TNV94L", "power": "37.5 kW"},
             "images": [IMG_SMALL]},
            {"name": "SANY SY75C", "category": "Excavator", "subcategory": "Small Excavator", "model_code": "SY75C",
             "year": 2025, "price": 780000000, "status": "available",
             "description": "Banyak digunakan di sektor konstruksi ringan, perkebunan, dan operasional militer.",
             "specs": {"operating_weight": "7500 kg", "bucket_capacity": "0.32 m³", "engine": "Yanmar 4TNV98", "power": "45 kW"},
             "images": [IMG_SMALL]},
            {"name": "SANY SY135C", "category": "Excavator", "subcategory": "Small Excavator", "model_code": "SY135C",
             "year": 2025, "price": 1150000000, "status": "available",
             "description": "Ekskavator 13.5 ton serbaguna untuk infrastruktur dan perkebunan.",
             "specs": {"operating_weight": "13500 kg", "bucket_capacity": "0.53 m³", "engine": "Isuzu 4JJ1X", "power": "86 kW"},
             "images": [IMG_MED2]},
            {"name": "SANY SY205C", "category": "Excavator", "subcategory": "Medium Excavator", "model_code": "SY205C",
             "year": 2025, "price": 1650000000, "status": "available",
             "description": "Ekskavator 20.5 ton dengan efisiensi bahan bakar terbaik di kelasnya.",
             "specs": {"operating_weight": "20500 kg", "bucket_capacity": "0.9 m³", "engine": "Mitsubishi 4M50", "power": "118 kW"},
             "images": [IMG_MED2]},
            {"name": "SANY SY215C", "category": "Excavator", "subcategory": "Medium Excavator", "model_code": "SY215C",
             "year": 2025, "price": 1850000000, "status": "available",
             "description": "Salah satu unit paling populer untuk sektor konstruksi dan infrastruktur umum.",
             "specs": {"operating_weight": "21500 kg", "bucket_capacity": "1.0 m³", "engine": "Isuzu 4HK1X", "power": "129 kW", "max_dig_depth": "6720 mm"},
             "images": [IMG_MED]},
            {"name": "SANY SY365H", "category": "Excavator", "subcategory": "Large / Mining Excavator", "model_code": "SY365H",
             "year": 2024, "price": 2650000000, "status": "rented",
             "description": "Ekskavator 36.5 ton untuk aplikasi berat & tambang.",
             "specs": {"operating_weight": "36500 kg", "bucket_capacity": "1.9 m³", "engine": "Mitsubishi 6D34", "power": "202 kW", "max_dig_depth": "7420 mm"},
             "images": [IMG_LARGE]},
            {"name": "SANY SY500H", "category": "Excavator", "subcategory": "Large / Mining Excavator", "model_code": "SY500H",
             "year": 2024, "price": 3750000000, "status": "available",
             "description": "Ekskavator tambang 50 ton dengan boom heavy-duty.",
             "specs": {"operating_weight": "50000 kg", "bucket_capacity": "2.6 m³", "engine": "Isuzu 6WG1", "power": "300 kW"},
             "images": [IMG_LARGE]},
            {"name": "SANY SY750H", "category": "Excavator", "subcategory": "Large / Mining Excavator", "model_code": "SY750H",
             "year": 2024, "price": 6800000000, "status": "available",
             "description": "Ekskavator 75 ton untuk quarry dan tambang kelas menengah.",
             "specs": {"operating_weight": "75000 kg", "bucket_capacity": "4.6 m³", "engine": "Cummins QSX15", "power": "447 kW"},
             "images": [IMG_LARGE2]},
            {"name": "SANY SY870H", "category": "Excavator", "subcategory": "Large / Mining Excavator", "model_code": "SY870H",
             "year": 2024, "price": 7900000000, "status": "available",
             "description": "Ekskavator 87 ton, produktivitas tinggi untuk overburden removal.",
             "specs": {"operating_weight": "87000 kg", "bucket_capacity": "5.4 m³", "engine": "Cummins QSX15", "power": "522 kW"},
             "images": [IMG_LARGE2]},
            {"name": "SANY SY1250H", "category": "Excavator", "subcategory": "Large / Mining Excavator", "model_code": "SY1250H",
             "year": 2024, "price": 14500000000, "status": "available",
             "description": "Andalan untuk pemindahan material tambang skala besar.",
             "specs": {"operating_weight": "125000 kg", "bucket_capacity": "7.5 m³", "engine": "Cummins QSK23", "power": "567 kW"},
             "images": [IMG_LARGE2]},
            {"name": "SANY SY2000H", "category": "Excavator", "subcategory": "Large / Mining Excavator", "model_code": "SY2000H",
             "year": 2024, "price": 28000000000, "status": "available",
             "description": "Unit super besar kelas berat untuk produktivitas tambang ekstra ekstrem.",
             "specs": {"operating_weight": "200000 kg", "bucket_capacity": "12.0 m³", "engine": "Cummins QSK38", "power": "940 kW"},
             "images": [IMG_LARGE]},
            {"name": "SANY SY3000E", "category": "Excavator", "subcategory": "Electric Excavator", "model_code": "SY3000E",
             "year": 2025, "price": 45000000000, "status": "available",
             "description": "Ekskavator tambang elektrik berkapasitas masif untuk mendukung sustainable mining.",
             "specs": {"operating_weight": "300000 kg", "bucket_capacity": "16.0 m³", "powertrain": "Listrik 1500 kW", "emisi": "Zero tailpipe"},
             "images": [IMG_ELECTRIC]},
            {"name": "SANY SR235MV", "category": "Drilling Rig", "subcategory": "Drilling Rig", "model_code": "SR235MV",
             "year": 2025, "price": 9500000000, "status": "available",
             "description": "Mesin bor pemancang untuk fondasi dalam dan paku bumi diameter menengah.",
             "specs": {"max_torque": "235 kNm", "max_drill_diameter": "2000 mm", "max_drill_depth": "65 m", "engine": "Cummins QSL9"},
             "images": [IMG_RIG]},
            {"name": "SANY SR285MV", "category": "Drilling Rig", "subcategory": "Drilling Rig", "model_code": "SR285MV",
             "year": 2025, "price": 11800000000, "status": "available",
             "description": "Rotary drilling rig serbaguna untuk infrastruktur jembatan dan gedung tinggi.",
             "specs": {"max_torque": "285 kNm", "max_drill_diameter": "2300 mm", "max_drill_depth": "88 m", "engine": "Cummins QSL9"},
             "images": [IMG_RIG2]},
            {"name": "SANY SR405R", "category": "Drilling Rig", "subcategory": "Drilling Rig", "model_code": "SR405R",
             "year": 2024, "price": 16500000000, "status": "available",
             "description": "Drilling rig kelas besar untuk pekerjaan fondasi ekstrem.",
             "specs": {"max_torque": "405 kNm", "max_drill_diameter": "2800 mm", "max_drill_depth": "103 m", "engine": "Cummins QSZ13"},
             "images": [IMG_RIG]},
            {"name": "SANY SYL956H", "category": "Wheel Loader", "subcategory": "Wheel Loader", "model_code": "SYL956H",
             "year": 2025, "price": 1450000000, "status": "available",
             "description": "Wheel loader kelas 5 ton paling umum di pasar Indonesia untuk stockpile tambang, perkebunan sawit, dan pabrik semen.",
             "specs": {"rated_load": "5000 kg", "bucket_capacity": "3.0 m³", "engine": "Weichai WP10G220E343", "power": "162 kW"},
             "images": [IMG_LOADER]},
        ]
        for un in units_seed:
            await db.units.insert_one({"id": new_id(), **un, "created_at": now_iso()})

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
    await db.telemetry.create_index([("unit_id", 1), ("recorded_at", -1)])
    await db.unit_state.create_index("unit_id", unique=True)
    await db.geofence_state.create_index("key", unique=True)
    init_storage()
    await seed_data()
    await seed_telemetry()
    await seed_geofences()
    if os.environ.get("TELEMETRY_SIMULATION", "true").lower() == "true":
        asyncio.create_task(telemetry_simulator())

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
