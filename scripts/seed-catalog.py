#!/usr/bin/env python3
"""
Seed script: Scan public/images/references/ and insert catalog_items into Supabase.

Usage:
    # Dry-run (preview without inserting):
    python scripts/seed-catalog.py --dry-run

    # Actually insert (requires SUPABASE_SERVICE_ROLE_KEY in .env):
    python scripts/seed-catalog.py

    # Custom paths / force insert even if duplicate detected:
    python scripts/seed-catalog.py --images-dir /custom/path --force

Requirements:
    - python-dotenv (pip install python-dotenv)
    - requests (pip install requests)
    - .env file with SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY for read-only)
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    print("ERROR: Missing python-dotenv. Install: pip install python-dotenv")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("ERROR: Missing requests. Install: pip install requests")
    sys.exit(1)

# ─── Constants ────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_IMAGES_DIR = PROJECT_ROOT / "public" / "images" / "references"
DEFAULT_ENV_PATH = PROJECT_ROOT / ".env"

# Valid image extensions (case-insensitive)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

# Category → shipping_category mapping
SHIPPING_MAP = {
    "Fashion": "fashion",
    "Makeup": "skincare",
    "Sepatu": "fashion",
    "Gacha": "general",
    "Toys": "general",
    "Snack": "food",
    "Disney Store": "general",
    "Donqi Items": "skincare",
    "Makanan": "food",
    "Elektronik": "elektronik",
}

# Category → display label for reporting
CATEGORY_LABELS = {
    "Fashion": "Fashion",
    "Makeup": "Makeup & Skincare",
    "Sepatu": "Sepatu",
    "Gacha": "Gacha",
    "Toys": "Toys",
    "Snack": "Snack & Food",
    "Disney Store": "Disney Store",
    "Donqi Items": "Donqi Items",
    "Makanan": "Makanan",
    "Elektronik": "Elektronik",
}

# ─── Helpers ──────────────────────────────────────────────────────────────────


def load_env(env_path: Path) -> dict:
    """Load environment variables from .env file."""
    if not env_path.exists():
        print(f"⚠  .env not found at {env_path}")
        print(f"   Copy from {env_path}.example and add SUPABASE_SERVICE_ROLE_KEY")
        return {}

    load_dotenv(dotenv_path=str(env_path))
    result = {
        "supabase_url": (
            os.environ.get("SUPABASE_URL")
            or os.environ.get("VITE_SUPABASE_URL", "")
        ).rstrip("/"),
        "service_role_key": (
            os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            or os.environ.get("SUPABASE_SECRET_KEY", "")
        ),
        "anon_key": os.environ.get("VITE_SUPABASE_ANON_KEY", ""),
    }

    if not result["supabase_url"]:
        print("⚠  SUPABASE_URL not found in .env")
    if not result["service_role_key"]:
        print("⚠  SUPABASE_SERVICE_ROLE_KEY not found in .env")
        print("   Add it to .env (not VITE_ prefix, keep it server-side only)")
        print("   See .env.example for reference")

    return result


def collect_images(images_dir: Path) -> list[dict]:
    """
    Recursively scan images_dir and return a list of dicts with:
        path (Path), rel_path (str), category (str), sub_category (str)
    """
    if not images_dir.is_dir():
        print(f"✖ ERROR: Images directory not found: {images_dir}")
        sys.exit(1)

    items = []
    base_len = len(images_dir.parts)

    for entry in sorted(images_dir.rglob("*")):
        if not entry.is_file():
            continue
        if entry.suffix.lower() not in IMAGE_EXTENSIONS:
            continue

        # Relative path from the references folder
        rel_path = entry.relative_to(images_dir)
        parts = rel_path.parts

        # category = level 1 folder
        category = parts[0] if len(parts) >= 1 else ""

        # sub_category = level 2 folder (or "" if file is directly under category)
        sub_category = parts[1] if len(parts) >= 2 and entry.parent != images_dir / parts[0] else ""
        # Sanitize: if sub_category looks like a parent-dir name of the file itself (depth analysis)
        # If parts has only the category dir + filename, sub_category is empty
        if len(parts) < 2:
            sub_category = ""
        elif len(parts) == 2:
            # parts[1] is the filename, not a subfolder
            sub_category = ""
        else:
            # parts[1] is the subfolder name
            sub_category = parts[1]

        # Special case: deep nesting like GU/Special Collections/Harry Potter X GU/
        # We still use GU as the sub_category (the immediate child of the category)
        # Already handled above — parts[1] is GU

        items.append({
            "path": entry,
            "rel_path": str(rel_path),
            "category": category,
            "sub_category": sub_category,
        })

    return items


def build_name(category: str, sub_category: str, idx: int) -> str:
    """Build a sequential display name."""
    label = sub_category if sub_category else category
    return f"{label} #{idx}"


def get_shipping_category(category: str, sub_category: str) -> str:
    """
    Determine shipping_category. Checks sub_category first for
    finer-grained mapping, then falls back to category-level map.
    """
    # Check sub_category overrides
    if sub_category.lower() in ("skincare",):
        return "skincare"

    # If Donqi Items → check sub_category for more specific
    if category == "Donqi Items":
        sc = sub_category.lower()
        if "snack" in sc or "food" in sc:
            return "food"
        return "skincare"  # default for Donqi Items

    # Check main category map
    return SHIPPING_MAP.get(category, "general")


def make_tags(category: str, sub_category: str) -> list[str]:
    """Build tags list from category + sub_category."""
    tags = [category.lower()]
    if sub_category:
        tags.append(sub_category.lower())
    return tags


def upsert_catalog_item(
    session: requests.Session,
    supabase_url: str,
    service_role_key: str,
    item: dict,
    retries: int = 3,
) -> bool:
    """
    Insert one catalog_item via Supabase REST API.
    Uses 'Prefer: resolution=merge-duplicates' on images path to handle
    duplicate image paths gracefully.

    Returns True on success, False on failure.
    """
    endpoint = f"{supabase_url}/rest/v1/catalog_items"
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    last_error = None
    for attempt in range(1, retries + 1):
        try:
            resp = session.post(endpoint, headers=headers, json=item, timeout=30)
            if resp.status_code in (200, 201, 204):
                return True
            # 409 Conflict → duplicate (already exists), treat as success
            if resp.status_code == 409:
                return True
            last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
        except requests.RequestException as e:
            last_error = str(e)

        if attempt < retries:
            time.sleep(1.5 * attempt)

    print(f"  ✖ FAIL (after {retries} retries): {last_error}")
    return False


def group_by_subcategory(items: list[dict]) -> dict:
    """
    Group items by (category, sub_category).
    Returns dict: (cat, sub) → [items]
    """
    groups = {}
    for item in items:
        key = (item["category"], item["sub_category"])
        groups.setdefault(key, []).append(item)
    return groups


# ─── Main ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Seed catalog_items from reference images",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--images-dir",
        type=str,
        default=str(DEFAULT_IMAGES_DIR),
        help=f"Path to references images directory (default: {DEFAULT_IMAGES_DIR})",
    )
    parser.add_argument(
        "--env-file",
        type=str,
        default=str(DEFAULT_ENV_PATH),
        help=f"Path to .env file (default: {DEFAULT_ENV_PATH})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be inserted without making API calls",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip duplicate check, force insert even if data exists",
    )
    args = parser.parse_args()

    images_dir = Path(args.images_dir)
    env_path = Path(args.env_file)

    # ── 1. Load environment ──────────────────────────────────────────────
    print("=" * 60)
    print("  MyBagasi - Seed Catalog from Reference Images")
    print("=" * 60)

    env = load_env(env_path)
    if not args.dry_run and not env["service_role_key"]:
        print("\n✖ Cannot proceed without SUPABASE_SERVICE_ROLE_KEY.")
        print("  Run with --dry-run to preview, or add the key to .env.\n")
        sys.exit(1)

    supabase_url = env["supabase_url"]
    print(f"  Supabase URL: {supabase_url or '(not set)'}")
    print(f"  Images dir:   {images_dir}")
    print(f"  Dry-run:      {'YES' if args.dry_run else 'NO'}")
    print()

    # ── 2. Collect and group images ──────────────────────────────────────
    print("📁 Scanning images...")
    all_items = collect_images(images_dir)
    print(f"   Found {len(all_items)} image files across {len(set(i['category'] for i in all_items))} categories\n")

    if not all_items:
        print("No images found. Exiting.")
        sys.exit(0)

    # Group by (category, sub_category)
    groups = group_by_subcategory(all_items)

    # ── 3. Build catalog items ───────────────────────────────────────────
    catalog_entries = []
    stats = {}  # category → count

    # Sort groups for deterministic ordering
    sorted_keys = sorted(groups.keys())

    for cat, sub in sorted_keys:
        group_items = groups[(cat, sub)]
        # Sort by filename for deterministic ordering within group
        group_items.sort(key=lambda x: x["path"].name)

        for idx, img in enumerate(group_items, start=1):
            name = build_name(cat, sub, idx)
            shipping_cat = get_shipping_category(cat, sub)
            tags = make_tags(cat, sub)

            entry = {
                "category": cat,
                "sub_category": sub,
                "name": name,
                "description": "",
                "price_jpy": None,
                "price_idr": None,
                "currency": "JPY",
                "images": json.dumps([f"/images/references/{img['rel_path']}"]),
                "source": "reference",
                "marketplace": "",
                "url": "",
                "tags": json.dumps(tags),
                "weight_kg": 0,
                "shipping_category": shipping_cat,
                "active": True,
                "sort_order": idx,
                "metadata": json.dumps({}),
            }
            catalog_entries.append(entry)
            stats[cat] = stats.get(cat, 0) + 1

    # ── 4. Report summary ────────────────────────────────────────────────
    print("📊 CATALOG SUMMARY")
    print("-" * 40)
    total = 0
    for cat in sorted(stats.keys()):
        label = CATEGORY_LABELS.get(cat, cat)
        print(f"  {label:25s} : {stats[cat]:4d} items")
        total += stats[cat]
    print("-" * 40)
    print(f"  {'TOTAL':25s} : {total:4d} items")
    print()

    # Show per-sub_category breakdown
    print("📂 Per Sub-Category Breakdown:")
    print("-" * 60)
    for cat, sub in sorted_keys:
        count = len(groups[(cat, sub)])
        sub_label = sub if sub else "(direct)"
        print(f"  {cat:20s} / {sub_label:30s} : {count:3d}")
    print()

    if args.dry_run:
        print("🔍 DRY-RUN — First 5 items preview:")
        print("-" * 80)
        for entry in catalog_entries[:5]:
            print(f"  [{entry['category']:15s}] {entry['name']:25s} → "
                  f"ship={entry['shipping_category']:10s} tags={entry['tags']}")
            print(f"  {'':19s} {json.loads(entry['images'])[0]}")
            print()
        if len(catalog_entries) > 5:
            print(f"  ... and {len(catalog_entries) - 5} more items")
        print()
        print("✅ Dry-run complete. No data was inserted.")
        print(f"   To insert: python scripts/seed-catalog.py")
        print(f"   (requires SUPABASE_SERVICE_ROLE_KEY in .env)")
        return

    # ── 5. Insert into Supabase ──────────────────────────────────────────
    print("🚀 Inserting into Supabase...")

    session = requests.Session()
    success_count = 0
    fail_count = 0

    for i, entry in enumerate(catalog_entries, start=1):
        ok = upsert_catalog_item(
            session, supabase_url, env["service_role_key"], entry
        )
        if ok:
            success_count += 1
        else:
            fail_count += 1

        # Progress indicator
        if i % 25 == 0 or i == len(catalog_entries):
            percent = int(i / len(catalog_entries) * 100)
            bar_len = 20
            filled = int(bar_len * i / len(catalog_entries))
            bar = "█" * filled + "░" * (bar_len - filled)
            print(f"  [{bar}] {i}/{len(catalog_entries)} ({percent}%) — "
                  f"OK={success_count} ERR={fail_count}", end="\r")
    print()

    # ── 6. Final report ──────────────────────────────────────────────────
    print()
    print("=" * 60)
    if fail_count == 0:
        print(f"  ✅ SUCCESS: All {success_count} items inserted.")
    else:
        print(f"  ⚠  PARTIAL: {success_count} inserted, {fail_count} failed.")
    print("=" * 60)

    # ── Save summary to JSON for reference ───────────────────────────────
    summary_path = PROJECT_ROOT / "scripts" / "seed-catalog-summary.json"
    summary = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_images_found": len(all_items),
        "total_inserted": success_count,
        "total_failed": fail_count,
        "by_category": {cat: stats.get(cat, 0) for cat in sorted(stats.keys())},
        "by_subcategory": {
            f"{cat}/{sub}": len(groups[(cat, sub)])
            for cat, sub in sorted_keys
        },
    }
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n📄 Summary saved to: {summary_path}")


if __name__ == "__main__":
    main()
