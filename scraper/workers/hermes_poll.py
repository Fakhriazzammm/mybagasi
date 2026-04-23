#!/usr/bin/env python3
"""
Hermes Browser Scrape Worker

This script is designed to be called by a Hermes cron job.
It polls Supabase for scrape_jobs with status='pending_hermes',
and for each job, prints the URL so the Hermes agent can browse it.

Usage (as Hermes cron script):
    hermes cron create --name "bagasi-browser" --script /opt/mybagasi/scraper/workers/hermes_poll.py "5m" \
        "Check for pending_hermes scrape jobs and process them"

The Hermes agent will:
1. See the output of this script (pending jobs)
2. Browse each URL with its browser tools
3. Extract product data
4. POST results to the backend /scrape-process endpoint
"""

import os
import sys
import json
import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
BACKEND_URL = os.getenv("VITE_BACKEND_BASE_URL", "http://127.0.0.1:8000")


def sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_pending_jobs():
    """Fetch pending_hermes jobs from Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Supabase not configured")
        return []

    with httpx.Client(timeout=10) as client:
        resp = client.get(
            f"{SUPABASE_URL}/rest/v1/scrape_jobs",
            headers=sb_headers(),
            params={
                "status": "eq.pending_hermes",
                "select": "id,url,created_at",
                "order": "created_at.asc",
                "limit": "5",
            },
        )
        if resp.status_code != 200:
            print(f"ERROR: Supabase query failed: {resp.status_code} {resp.text}")
            return []
        return resp.json()


def main():
    jobs = fetch_pending_jobs()

    if not jobs:
        print("No pending Hermes browser jobs.")
        return

    print(f"Found {len(jobs)} pending browser job(s):")
    print()

    for job in jobs:
        job_id = job["id"]
        url = job["url"]
        print(f"Job ID: {job_id}")
        print(f"URL: {url}")
        print(f"Created: {job.get('created_at', 'unknown')}")
        print()

    print("---")
    print(f"Process these {len(jobs)} job(s) by browsing each URL, extracting product data,")
    print("and posting results to the backend.")
    print()
    print("For each job, extract: title, price_display, price_jpy, condition, images,")
    print("description, seller, marketplace, available, confidence")
    print()
    print("Then POST to the backend:")

    for job in jobs:
        job_id = job["id"]
        url = job["url"]
        print(f"  curl -X POST {BACKEND_URL}/scrape-process -H 'Content-Type: application/json' -d '{{\"job_id\": \"{job_id}\", \"result\": {{...product data...}}}}'")


if __name__ == "__main__":
    main()
