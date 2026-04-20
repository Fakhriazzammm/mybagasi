from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from scrapers.dispatcher import scrape_url
from mayar_routes import router as mayar_router

app = FastAPI(title="MyBagasi Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(mayar_router)


class ScrapeRequest(BaseModel):
    url: str


@app.post("/scrape")
async def scrape(req: ScrapeRequest):
    try:
        return await scrape_url(req.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Scraping failed: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "service": "MyBagasi Backend"}
