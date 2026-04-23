from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field


class ProductData(BaseModel):
    title: str
    price_jpy: Optional[int] = None
    price_display: str = ""
    condition: Optional[str] = None
    images: list[str] = Field(default_factory=list)
    description: Optional[str] = None
    seller: Optional[str] = None
    marketplace: str
    available: bool = True
    url: str
    scraped_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    confidence: Optional[str] = None
    scrape_reason_code: Optional[str] = None  # e.g. PLAYWRIGHT|CRAWL4AI|BLOCKED|NOT_FOUND|PARSE_EMPTY|SCREENSHOT_AI


def parse_jpy(text: str) -> Optional[int]:
    """Extract integer yen amount from any price string."""
    cleaned = re.sub(r"[^\d]", "", text)
    return int(cleaned) if cleaned else None


BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
