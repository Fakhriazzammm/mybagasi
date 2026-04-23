from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
import os
import json
import uuid
from datetime import datetime, timezone
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from urllib.parse import urlparse
from typing import Optional, Any
import httpx

from scrapers.dispatcher import scrape_url
from scrapers.models import ProductData
from scrapers.search_web import search_products_by_keyword
from scrapers.hermes_browser import hermes_browser_scrape, create_hermes_job, poll_hermes_result
from mayar_routes import router as mayar_router

app = FastAPI(title="MyBagasi Backend", version="1.0.0")

# ── Supabase config for async scrape jobs ──
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(mayar_router)


class ScrapeRequest(BaseModel):
    url: str


class SearchRequest(BaseModel):
    keyword: str
    condition: str | None = None
    size: str | None = None
    limit: int = 6


@app.post("/scrape")
async def scrape(req: ScrapeRequest):
    try:
        return await scrape_url(req.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Always return structured payload to keep AI flow stable,
        # instead of surfacing raw 4xx/5xx as hard failures.
        message = str(e).lower()
        marketplace = _domain(req.url)
        if any(token in message for token in ["404", "not found", "gone"]):
            return ProductData(
                title="Not found",
                price_jpy=None,
                price_display="",
                images=[],
                description="Produk tidak ditemukan atau link sudah tidak aktif.",
                marketplace=marketplace,
                available=False,
                url=req.url,
                confidence="low",
                scrape_reason_code="NOT_FOUND",
            )
        if any(token in message for token in ["403", "429", "forbidden", "captcha", "blocked"]):
            return ProductData(
                title="Blocked page",
                price_jpy=None,
                price_display="",
                images=[],
                description="Halaman produk terproteksi anti-bot/CAPTCHA.",
                marketplace=marketplace,
                url=req.url,
                confidence="low",
                scrape_reason_code="BLOCKED",
            )
        return ProductData(
            title="Unknown Product",
            price_jpy=None,
            price_display="",
            images=[],
            description="Detail produk belum bisa diekstrak dari halaman.",
            marketplace=marketplace,
            url=req.url,
            confidence="low",
            scrape_reason_code="PARSE_EMPTY",
        )


@app.post("/search")
async def search(req: SearchRequest):
    keyword = (req.keyword or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")
    limit = req.limit if 1 <= req.limit <= 12 else 6
    products = await search_products_by_keyword(
        keyword=keyword,
        condition=req.condition,
        size=req.size,
        limit=limit,
    )
    return {"success": True, "items": products}


@app.get("/health")
def health():
    return {"status": "ok", "service": "MyBagasi Backend"}


def _domain(url: str) -> str:
    hostname = urlparse(url).hostname or ""
    return hostname[4:] if hostname.startswith("www.") else (hostname or "generic")


# ── Async scrape-job models ──
class ScrapeAsyncRequest(BaseModel):
    url: str
    job_type: Optional[str] = None
    keyword: Optional[str] = None
    user_id: Optional[str] = None


class ScrapeProcessRequest(BaseModel):
    job_id: str
    result: Optional[Any] = None
    error: Optional[str] = None


def _sb_headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


# ── POST /scrape-async ──────────────────────────────────────────────
@app.post("/scrape-async")
async def scrape_async(req: ScrapeAsyncRequest):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    payload = {
        "id": job_id,
        "url": req.url,
        "status": "pending",
        "created_at": now,
        "job_type": req.job_type,
        "keyword": req.keyword,
        "user_id": req.user_id,
    }
    # Remove None values so Supabase doesn't complain
    payload = {k: v for k, v in payload.items() if v is not None}

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/scrape_jobs",
            headers=_sb_headers(),
            json=payload,
            timeout=15,
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"Supabase insert failed: {resp.status_code} {resp.text}",
        )

    return {"job_id": job_id, "status": "pending"}


# ── GET /scrape-status/{job_id} ─────────────────────────────────────
@app.get("/scrape-status/{job_id}")
async def scrape_status(job_id: str):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/scrape_jobs",
            headers=_sb_headers(),
            params={"id": f"eq.{job_id}", "select": "*"},
            timeout=15,
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Supabase query failed: {resp.status_code} {resp.text}",
        )

    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Job not found")

    return rows[0]


# ── POST /scrape-process  (internal – called by AI worker) ──────────
@app.post("/scrape-process")
async def scrape_process(req: ScrapeProcessRequest):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    now = datetime.now(timezone.utc).isoformat()

    if req.error:
        update = {"status": "failed", "error": req.error, "completed_at": now}
    else:
        update = {
            "status": "completed",
            "result": req.result if req.result is not None else {},
            "completed_at": now,
        }

    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/scrape_jobs",
            headers=_sb_headers(),
            params={"id": f"eq.{req.job_id}"},
            json=update,
            timeout=15,
        )

    if resp.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Supabase update failed: {resp.status_code} {resp.text}",
        )

    return {"success": True}


# ── POST /browse-scrape  (Hermes browser bridge) ────────────────────
class BrowseScrapeRequest(BaseModel):
    url: str
    max_wait: int = 90  # seconds to wait for Hermes result


@app.post("/browse-scrape")
async def browse_scrape(req: BrowseScrapeRequest):
    """
    Direct Hermes browser scrape.

    Creates a Supabase job with status 'pending_hermes', then polls
    until the Hermes worker completes it (or timeout).

    The Hermes cron job should be configured to:
      1. Poll Supabase for scrape_jobs WHERE status = 'pending_hermes'
      2. Browse each URL with browser tools
      3. Extract product data and POST to /scrape-process
    """
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    try:
        result = await hermes_browser_scrape(url, max_wait=req.max_wait)
    except Exception as e:
        marketplace = _domain(url)
        return ProductData(
            title="Browse Scrape Error",
            price_jpy=None,
            price_display="",
            images=[],
            description=f"Hermes browser scrape failed: {str(e)}",
            marketplace=marketplace,
            url=url,
            confidence="low",
            scrape_reason_code="HERMES_BROWSER_ERROR",
        )

    if result:
        return result

    # Timed out or no result
    marketplace = _domain(url)
    return ProductData(
        title="Browse Scrape Timeout",
        price_jpy=None,
        price_display="",
        images=[],
        description="Hermes browser scrape timed out — worker may not be running.",
        marketplace=marketplace,
        url=url,
        confidence="low",
        scrape_reason_code="HERMES_BROWSER_TIMEOUT",
    )


# ── POST /browse-scrape-async  (non-blocking) ──────────────────────
class BrowseScrapeAsyncRequest(BaseModel):
    url: str


@app.post("/browse-scrape-async")
async def browse_scrape_async(req: BrowseScrapeAsyncRequest):
    """
    Non-blocking version of /browse-scrape.
    Creates a 'pending_hermes' job and returns the job_id immediately.
    Use /scrape-status/{job_id} to poll for the result.
    """
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    try:
        job_id = await create_hermes_job(url)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to create Hermes browser job: {e}",
        )

    return {"job_id": job_id, "status": "pending_hermes"}
