from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
import os
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from urllib.parse import urlparse

from scrapers.dispatcher import scrape_url
from scrapers.models import ProductData
from scrapers.search_web import search_products_by_keyword
from mayar_routes import router as mayar_router

app = FastAPI(title="MyBagasi Backend", version="1.0.0")

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
