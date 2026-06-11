#!/usr/bin/env python3
"""
Deploy MyBagasi Cart System — Edge Functions + SQL Migration

Usage:
    python3 deploy-cart-system.py

Requires:
    - Supabase Personal Access Token (from dashboard: Settings → API → Access Tokens)
    - Set SUPABASE_ACCESS_TOKEN env var or pass via --token
"""

import os
import sys
import json
import subprocess
from pathlib import Path

PROJECT_REF = "gvbikxcnlmlcrbixwpxl"
BASE_DIR = Path("/opt/mybagasi")

FUNCTIONS = ["add-to-cart", "get-cart", "checkout-cart"]

def get_token():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if token:
        return token
    print("❌ SUPABASE_ACCESS_TOKEN not set.")
    print("   Get one from: https://supabase.com/dashboard/project/{PROJECT_REF}/settings/api → Access Tokens")
    print("   Then: export SUPABASE_ACCESS_TOKEN=sbp_xxx")
    sys.exit(1)

def deploy_functions(token):
    """Deploy Edge Functions via supabase CLI."""
    print("\n📦 Deploying Edge Functions...")
    for fn in FUNCTIONS:
        print(f"  → {fn}...", end=" ")
        result = subprocess.run([
            "supabase", "functions", "deploy", fn,
            "--project-ref", PROJECT_REF,
            "--use-api",
        ], capture_output=True, text=True, timeout=120, cwd=str(BASE_DIR),
           env={**os.environ, "SUPABASE_ACCESS_TOKEN": token})
        
        if result.returncode == 0:
            print("✅")
        else:
            print(f"❌\n     {result.stderr.splitlines()[-1] if result.stderr else 'unknown error'}")
            return False
    return True

def run_migration(token):
    """Run SQL migration via Supabase SQL endpoint."""
    print("\n🗄️  Running SQL migration...")
    
    migration_file = BASE_DIR / "supabase" / "migrations" / "20260611000001_cart_items.sql"
    if not migration_file.exists():
        print(f"  ❌ Migration file not found: {migration_file}")
        return False
    
    sql = migration_file.read_text()
    
    # Use Supabase Management API SQL endpoint
    import urllib.request
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    )
    
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        print(f"  ✅ Migration successful: {result}")
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        print(f"  ❌ Migration failed: {e.code} - {body}")
        return False

def main():
    print("=" * 50)
    print("🛒 MyBagasi Cart System - Deployment")
    print("=" * 50)
    
    token = get_token()
    
    # Step 1: Deploy Edge Functions
    if not deploy_functions(token):
        print("\n⚠️  Edge Function deployment failed. Fix errors above and retry.")
        sys.exit(1)
    
    # Step 2: Run Migration
    if not run_migration(token):
        print("\n⚠️  SQL migration failed. You can run it manually in Supabase Dashboard → SQL Editor.")
        print(f"   File: {BASE_DIR / 'supabase' / 'migrations' / '20260611000001_cart_items.sql'}")
        sys.exit(1)
    
    print("\n" + "=" * 50)
    print("✅ Cart system deployed successfully!")
    print("=" * 50)
    print("\nNext steps:")
    print("1. Restart Hermes gateway: pkill -f 'hermes.*mybagasi-ai'")
    print("2. Test: 'cari produk' → add to cart → lihat cart → checkout")

if __name__ == "__main__":
    main()
