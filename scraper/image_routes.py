"""
Image caching routes for MyBagasi.
Downloads product images and serves them locally via static mount.
"""
from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

IMAGES_DIR = os.path.join(os.path.dirname(__file__), "data", "images")


def _ensure_images_dir():
    os.makedirs(IMAGES_DIR, exist_ok=True)


# ─── GET /image/save — download & cache product image ────────────────

@router.get("/image/save")
async def image_save(
    url: str = Query(...),
    product_id: str = Query(...),
):
    """Download image from URL and save to data/images/{product_id}.jpg."""
    _ensure_images_dir()

    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id is required")

    dest_path = os.path.join(IMAGES_DIR, f"{product_id}.jpg")

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to download image: HTTP {e.response.status_code}",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to download image: {e}",
        )

    content_type = resp.headers.get("content-type", "")
    if "image" not in content_type:
        raise HTTPException(
            status_code=400,
            detail=f"URL did not return an image (content-type: {content_type})",
        )

    with open(dest_path, "wb") as f:
        f.write(resp.content)

    return {"local_url": f"/images/{product_id}.jpg"}


# ─── GET /image/get — check cached image ─────────────────────────────

@router.get("/image/get")
async def image_get(
    product_id: str = Query(...),
):
    """Return local URL if image is already cached, or error if not found."""
    _ensure_images_dir()

    if not product_id:
        raise HTTPException(status_code=400, detail="product_id is required")

    dest_path = os.path.join(IMAGES_DIR, f"{product_id}.jpg")

    if os.path.exists(dest_path):
        return {"local_url": f"/images/{product_id}.jpg"}
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Image not cached for product_id: {product_id}",
        )
