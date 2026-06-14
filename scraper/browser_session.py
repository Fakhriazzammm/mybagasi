"""
Per-user Playwright browser session manager for MyBagasi Bot.

Each Telegram user gets their own browser context (isolated tab).
Reuses the singleton browser instance from scrapers/browser.py.

Supported actions:
  - navigate(url)      Open a URL
  - click(selector)    Click element by text or CSS selector
  - type(selector,text) Type text into an input
  - scroll(direction)   Scroll up/down
  - screenshot(path)    Save screenshot to file
  - snapshot()          Get page text content (like browser_snapshot)
  - close()             Close user's context
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

log = logging.getLogger("mybagasi_browser_session")

# Screenshot storage
SCREENSHOT_DIR = Path("/tmp/mybagasi_screenshots")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

# Import singleton browser from scraper
from scrapers.browser import get_browser, close_browser

# Per-user sessions: {chat_id: {"context": ..., "page": ..., "current_url": ..., "created_at": ...}}
_sessions: dict[int, dict[str, Any]] = {}

# Session TTL: 30 min inactivity
_SESSION_TTL = 1800


async def _get_or_create_page(chat_id: int):
    """Get or create a browser page for this user."""
    # Clean stale sessions
    now = time.time()
    stale = [cid for cid, s in _sessions.items()
             if now - s.get("last_active", 0) > _SESSION_TTL]
    for cid in stale:
        await _close_session(cid)

    if chat_id in _sessions:
        session = _sessions[chat_id]
        session["last_active"] = now
        page = session.get("page")
        # Check if page is still usable
        if page and not page.is_closed():
            return page, session
        # Page closed, create new one in existing context
        ctx = session.get("context")
        if ctx:
            page = await ctx.new_page()
            session["page"] = page
            return page, session

    # Brand new session
    browser = await get_browser()
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 720},
        locale="en-US",
    )
    page = await context.new_page()
    session = {
        "context": context,
        "page": page,
        "current_url": "",
        "created_at": now,
        "last_active": now,
        "screenshot_count": 0,
    }
    _sessions[chat_id] = session
    log.info(f"New browser session for chat {chat_id}")
    return page, session


async def _close_session(chat_id: int):
    """Close a user's browser session."""
    session = _sessions.pop(chat_id, None)
    if not session:
        return
    try:
        page = session.get("page")
        if page and not page.is_closed():
            await page.close()
    except Exception:
        pass
    try:
        ctx = session.get("context")
        if ctx:
            await ctx.close()
    except Exception:
        pass
    log.info(f"Browser session closed for chat {chat_id}")


# ═══════════════════════════════════
# Public API
# ═══════════════════════════════════

async def navigate(chat_id: int, url: str, timeout: int = 45) -> dict[str, Any]:
    """Navigate to URL and return page snapshot info."""
    page, _ = await _get_or_create_page(chat_id)

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)
        await page.wait_for_load_state("networkidle", timeout=timeout * 1000)
        await asyncio.sleep(1)

        title = await page.title()
        current_url = page.url
        text_content = await page.evaluate("() => document.body?.innerText?.slice(0, 3000) || ''")

        # Build interactive element summary (like browser snapshot)
        interactive = await page.evaluate("""() => {
            const els = document.querySelectorAll(
                'a[href], button, input:not([type=hidden]), textarea, select, ' +
                '[role=button], [onclick], [tabindex]:not([tabindex=-1]), ' +
                'label, [contenteditable=true]'
            );
            const items = [];
            let ref = 1;
            for (const el of els) {
                if (el.offsetHeight === 0) continue;
                const tag = el.tagName.toLowerCase();
                const text = (el.textContent || '').trim().slice(0, 80);
                const href = (el.getAttribute('href') || '').slice(0, 100);
                const type = el.getAttribute('type') || '';
                const name = el.getAttribute('name') || '';
                const placeholder = el.getAttribute('placeholder') || '';
                const aria = el.getAttribute('aria-label') || '';
                const role = el.getAttribute('role') || '';
                const cls = (el.className || '').slice(0, 40);

                let desc = `<${tag}`;
                if (text) desc += ` "${text.slice(0, 50)}"`;
                if (href) desc += ` href="${href}"`;
                if (type) desc += ` type=${type}`;
                if (name) desc += ` name=${name}`;
                if (placeholder) desc += ` placeholder="${placeholder}"`;
                if (aria) desc += ` aria="${aria}"`;
                if (role) desc += ` role=${role}`;
                if (cls && !cls.includes(' ')) desc += ` .${cls}`;
                desc += '>';

                items.push({ref: ref, desc: desc, tag: tag, text: text.slice(0, 60)});
                ref++;
            }
            return items.slice(0, 150);
        }""")

        _sessions[chat_id]["current_url"] = current_url

        return {
            "success": True,
            "title": title,
            "url": current_url,
            "text_preview": text_content[:2000],
            "interactive_elements": interactive,
            "element_count": len(interactive),
        }

    except Exception as e:
        log.warning(f"navigate error for {url[:60]}: {e}")
        return {"success": False, "error": str(e)}


async def snapshot(chat_id: int) -> dict[str, Any]:
    """Get current page accessibility tree / interactive elements."""
    page, session = await _get_or_create_page(chat_id)
    url = session.get("current_url", "")

    if not url:
        return {"success": False, "error": "No page loaded. Use /browse <url> first."}

    try:
        title = await page.title()
        text_content = await page.evaluate("() => document.body?.innerText?.slice(0, 5000) || ''")

        interactive = await page.evaluate("""() => {
            const els = document.querySelectorAll(
                'a[href], button, input:not([type=hidden]), textarea, select, ' +
                '[role=button], [onclick], [tabindex]:not([tabindex=-1]), ' +
                'label, [contenteditable=true], h1, h2, h3, h4'
            );
            const items = [];
            let ref = 1;
            for (const el of els) {
                if (el.offsetHeight === 0) continue;
                const tag = el.tagName.toLowerCase();
                const text = (el.textContent || '').trim().slice(0, 80);
                const href = (el.getAttribute('href') || '').slice(0, 100);
                const type = el.getAttribute('type') || '';
                const placeholder = el.getAttribute('placeholder') || '';
                const aria = el.getAttribute('aria-label') || '';
                const role = el.getAttribute('role') || '';
                const cls = (el.className || '').slice(0, 40);

                let desc = `<${tag}`;
                if (text) desc += ` "${text.slice(0, 60)}"`;
                if (href) desc += ` href="${href}"`;
                if (type) desc += ` type=${type}`;
                if (placeholder) desc += ` placeholder="${placeholder}"`;
                if (aria) desc += ` aria="${aria}"`;
                if (role) desc += ` role=${role}`;
                if (cls && !cls.includes(' ')) desc += ` .${cls}`;
                desc += '>';

                items.push({ref: ref, desc: desc, tag: tag, text: text.slice(0, 60)});
                ref++;
            }
            return items;
        }""")

        return {
            "success": True,
            "title": title,
            "url": url,
            "text_preview": text_content[:3000],
            "interactive_elements": interactive[:150],
            "element_count": len(interactive),
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


async def click_element(chat_id: int, selector: str) -> dict[str, Any]:
    """Click an element by ref number or text match."""
    page, _ = await _get_or_create_page(chat_id)

    try:
        # Try to interpret selector as ref number first
        if selector.startswith("@") and selector[1:].isdigit():
            ref_num = int(selector[1:])
            # Find element by ref
            result = await page.evaluate(f"""() => {{
                const els = document.querySelectorAll(
                    'a[href], button, input:not([type=hidden]), textarea, select, ' +
                    '[role=button], [onclick], [tabindex]:not([tabindex=-1]), ' +
                    'label, [contenteditable=true]'
                );
                let idx = 0;
                for (const el of els) {{
                    if (el.offsetHeight === 0) continue;
                    idx++;
                    if (idx === {ref_num}) {{
                        el.scrollIntoView({{behavior: 'instant', block: 'center'}});
                        return {{found: true, tag: el.tagName, text: (el.textContent || '').trim().slice(0, 60)}};
                    }}
                }}
                return {{found: false}};
            }}""")

            if result.get("found"):
                await page.evaluate(f"""() => {{
                    const els = document.querySelectorAll(
                        'a[href], button, input:not([type=hidden]), textarea, select, ' +
                        '[role=button], [onclick], [tabindex]:not([tabindex=-1]), ' +
                        'label, [contenteditable=true]'
                    );
                    let idx = 0;
                    for (const el of els) {{
                        if (el.offsetHeight === 0) continue;
                        idx++;
                        if (idx === {ref_num}) {{
                            el.click();
                            return;
                        }}
                    }}
                }}""")
                await asyncio.sleep(1)
                new_url = page.url
                return {
                    "success": True,
                    "action": "click",
                    "target": f"@e{ref_num} ({result.get('tag', '')})",
                    "text": result.get("text", ""),
                    "url": new_url,
                }

        # Try as text match
        result = await page.evaluate(f"""() => {{
            const searchText = {json.dumps(selector)};
            const els = document.querySelectorAll('a, button, [role=button], label, span, div');
            for (const el of els) {{
                const t = (el.textContent || '').trim();
                if (t.toLowerCase().includes(searchText.toLowerCase())) {{
                    if (el.offsetHeight === 0) continue;
                    el.scrollIntoView({{behavior: 'instant', block: 'center'}});
                    el.click();
                    return {{found: true, tag: el.tagName, text: t.slice(0, 60)}};
                }}
            }}
            return {{found: false}};
        }}""")

        if result.get("found"):
            await asyncio.sleep(1)
            new_url = page.url
            return {
                "success": True,
                "action": "click",
                "target": f'"{selector}"',
                "text": result.get("text", ""),
                "url": new_url,
            }

        return {"success": False, "error": f"Element not found: {selector}"}

    except Exception as e:
        return {"success": False, "error": str(e)}


async def type_text(chat_id: int, selector: str, text: str) -> dict[str, Any]:
    """Type text into an input field."""
    page, _ = await _get_or_create_page(chat_id)

    try:
        # Try ref number first
        if selector.startswith("@") and selector[1:].isdigit():
            ref_num = int(selector[1:])
            result = await page.evaluate(f"""() => {{
                const els = document.querySelectorAll(
                    'input:not([type=hidden]), textarea, [contenteditable=true], select'
                );
                let idx = 0;
                for (const el of els) {{
                    if (el.offsetHeight === 0) continue;
                    idx++;
                    if (idx === {ref_num}) {{
                        el.focus();
                        el.value = '';
                        el.value = {json.dumps(text)};
                        el.dispatchEvent(new Event('input', {{bubbles: true}}));
                        el.dispatchEvent(new Event('change', {{bubbles: true}}));
                        const name = el.getAttribute('name') || '';
                        const placeholder = el.getAttribute('placeholder') || '';
                        return {{found: true, tag: el.tagName, name: name, placeholder: placeholder}};
                    }}
                }}
                return {{found: false}};
            }}""")

            if result.get("found"):
                return {
                    "success": True,
                    "action": "type",
                    "target": f"@e{ref_num} ({result.get('tag', '')})",
                    "text_length": len(text),
                }

        # Try placeholder/name/aria match
        result = await page.evaluate(f"""() => {{
            const searchText = {json.dumps(selector)};
            const inputs = document.querySelectorAll('input:not([type=hidden]), textarea, [contenteditable=true]');
            for (const el of inputs) {{
                const placeholder = el.getAttribute('placeholder') || '';
                const name = el.getAttribute('name') || '';
                const aria = el.getAttribute('aria-label') || '';
                const label = document.querySelector('label[for=\"' + el.id + '\"]');
                const labelText = label ? label.textContent.trim() : '';

                if (placeholder.toLowerCase().includes(searchText.toLowerCase()) ||
                    name.toLowerCase().includes(searchText.toLowerCase()) ||
                    aria.toLowerCase().includes(searchText.toLowerCase()) ||
                    labelText.toLowerCase().includes(searchText.toLowerCase())) {{
                    el.focus();
                    el.value = '';
                    el.value = {json.dumps(text)};
                    el.dispatchEvent(new Event('input', {{bubbles: true}}));
                    el.dispatchEvent(new Event('change', {{bubbles: true}}));
                    return {{found: true, tag: el.tagName, placeholder: placeholder}};
                }}
            }}
            return {{found: false}};
        }}""")

        if result.get("found"):
            return {
                "success": True,
                "action": "type",
                "target": f'"{selector}"',
                "text_length": len(text),
            }

        return {"success": False, "error": f"Input not found: {selector}"}

    except Exception as e:
        return {"success": False, "error": str(e)}


async def scroll_page(chat_id: int, direction: str = "down") -> dict[str, Any]:
    """Scroll the page."""
    page, _ = await _get_or_create_page(chat_id)
    amount = 600 if direction == "down" else -600

    try:
        await page.evaluate(f"window.scrollBy(0, {amount})")
        await asyncio.sleep(0.5)
        scroll_y = await page.evaluate("window.scrollY")
        max_height = await page.evaluate("document.body.scrollHeight")
        return {
            "success": True,
            "direction": direction,
            "scroll_y": scroll_y,
            "scroll_pct": round(scroll_y / max_height * 100, 1) if max_height > 0 else 0,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


async def take_screenshot(chat_id: int) -> dict[str, Any]:
    """Take a screenshot of the current page."""
    page, _ = await _get_or_create_page(chat_id)

    session = _sessions.get(chat_id, {})
    count = session.get("screenshot_count", 0) + 1
    if chat_id in _sessions:
        _sessions[chat_id]["screenshot_count"] = count

    filename = f"screenshot_{chat_id}_{int(time.time())}_{count}.png"
    filepath = str(SCREENSHOT_DIR / filename)

    try:
        await page.screenshot(path=filepath, full_page=False)
        return {
            "success": True,
            "filepath": filepath,
            "filename": filename,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


async def close_session(chat_id: int) -> dict[str, Any]:
    """Close user's browser session."""
    await _close_session(chat_id)
    return {"success": True, "message": "Browser session closed"}


async def get_current_url(chat_id: int) -> str:
    """Get the URL currently loaded in user's browser."""
    session = _sessions.get(chat_id)
    if session:
        return session.get("current_url", "")
    return ""


async def cleanup_all():
    """Close all browser sessions. Call on bot shutdown."""
    for chat_id in list(_sessions.keys()):
        await _close_session(chat_id)
    log.info("All browser sessions cleaned up")


# ═══════════════════════════════════
# AI-Driven Browser (like Hermes)
# ═══════════════════════════════════

async def _screenshot_b64(chat_id: int) -> dict:
    """Take screenshot and return as base64 + page info."""
    page, session = await _get_or_create_page(chat_id)
    try:
        # Screenshot as bytes
        screenshot_bytes = await page.screenshot(full_page=False, type="jpeg", quality=70)
        b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
        
        # Get page text
        text = await page.evaluate("() => document.body?.innerText?.slice(0, 5000) || ''")
        title = await page.title()
        url = page.url
        
        # Get interactive elements
        interactive = await page.evaluate("""() => {
            const els = document.querySelectorAll(
                'a[href], button, input:not([type=hidden]), textarea, select, ' +
                '[role=button], [onclick], [tabindex]:not([tabindex=-1]), ' +
                'label, [contenteditable=true]'
            );
            const items = [];
            let ref = 1;
            for (const el of els) {
                if (el.offsetHeight === 0) continue;
                const tag = el.tagName.toLowerCase();
                const t = (el.textContent || '').trim().slice(0, 60);
                const href = el.getAttribute('href') || '';
                const placeholder = el.getAttribute('placeholder') || '';
                const role = el.getAttribute('role') || '';
                items.push({ref, tag, text: t || href.slice(0,40) || placeholder || role});
                ref++;
                if (ref > 30) break;
            }
            return items;
        }""")
        
        return {
            "success": True,
            "base64": b64,
            "title": title,
            "url": url,
            "text_preview": text[:3000],
            "elements": interactive,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


async def ai_browse(
    chat_id: int,
    goal: str,
    vision_fn,
    max_steps: int = 10,
    status_fn=None,
) -> dict:
    """
    AI-driven browser loop — like Hermes browser tools.
    
    Args:
        chat_id: Telegram user chat ID
        goal: What to find (e.g. "cari Onitsuka Tiger Mexico 66 di Rakuten")
        vision_fn: async callable(screenshot_b64, page_text, elements, goal, history)
                   -> dict {action, ...}
        max_steps: Max browsing iterations
        status_fn: Optional async callable(str) to update status message
        
    Returns:
        dict with success, summary, product info
    """
    log.info(f"AI browse started for chat {chat_id}: goal='{goal}'")
    
    # Step history for context
    history = []
    
    # Navigate to Rakuten search as starting point
    from urllib.parse import quote
    search_url = f"https://search.rakuten.co.jp/search/mall/{quote(goal)}/"
    
    nav_result = await navigate(chat_id, search_url, timeout=30)
    if not nav_result.get("success"):
        # Fallback to Amazon
        search_url = f"https://www.amazon.co.jp/s?k={quote(goal + ' japan')}"
        nav_result = await navigate(chat_id, search_url, timeout=30)
        if not nav_result.get("success"):
            # Fallback to Google
            search_url = f"https://www.google.com/search?q={quote(goal + ' japan buy')}"
            await navigate(chat_id, search_url, timeout=30)
    
    history.append({"step": "start", "url": search_url})
    
    if status_fn:
        await status_fn("🌐 *Membuka halaman...*")
    
    for step in range(1, max_steps + 1):
        if status_fn:
            await status_fn(f"🤔 *Langkah {step}/{max_steps} — menganalisis halaman...*")
        
        # 1. Screenshot + page context
        ss = await _screenshot_b64(chat_id)
        if not ss.get("success"):
            history.append({"step": step, "error": ss.get("error")})
            continue
        
        # 2. Ask Gemini Vision what to do
        vision_result = await vision_fn(
            screenshot_b64=ss["base64"],
            page_text=ss["text_preview"],
            elements=ss.get("elements", []),
            goal=goal,
            url=ss["url"],
            title=ss["title"],
            history=history,
            step=step,
            max_steps=max_steps,
        )
        
        if not vision_result or "action" not in vision_result:
            history.append({"step": step, "error": "Vision returned invalid response"})
            if status_fn:
                await status_fn("❌ *Gagal menganalisis halaman. Coba lagi.*")
            return {"success": False, "error": "Vision analysis failed", "history": history}
        
        action = vision_result["action"]
        reason = vision_result.get("reason", "")
        
        log.info(f"AI browse step {step}: {action} — {reason[:80]}")
        history.append({"step": step, "action": action, "reason": reason})
        
        # 3. Execute action
        if action == "done":
            if status_fn:
                await status_fn("✅ *Selesai!*")
            return {
                "success": True,
                "summary": vision_result.get("summary", "Produk ditemukan."),
                "product_name": vision_result.get("product_name", ""),
                "product_price": vision_result.get("product_price", ""),
                "product_url": ss["url"],
                "steps": step,
                "history": history,
            }
        
        elif action == "navigate":
            url = vision_result.get("url", "")
            if url:
                if status_fn:
                    await status_fn(f"🌐 *Membuka {url[:50]}...*")
                await navigate(chat_id, url, timeout=30)
        
        elif action == "click":
            selector = vision_result.get("selector", "")
            if selector:
                await click_element(chat_id, selector)
                await asyncio.sleep(2)
        
        elif action == "type":
            selector = vision_result.get("selector", "")
            text = vision_result.get("text", "")
            if selector and text:
                if status_fn:
                    await status_fn(f"⌨️ *Mengetik \"{text[:30]}...\"*")
                await type_text(chat_id, selector, text)
                await asyncio.sleep(1)
        
        elif action == "submit":
            # Press Enter to submit search
            page, _ = await _get_or_create_page(chat_id)
            try:
                await page.keyboard.press("Enter")
                await asyncio.sleep(2)
            except Exception:
                pass
        
        elif action == "scroll":
            direction = vision_result.get("direction", "down")
            await scroll_page(chat_id, direction)
            await asyncio.sleep(1)
        
        elif action == "wait":
            seconds = vision_result.get("seconds", 3)
            await asyncio.sleep(seconds)
        
        else:
            # Unknown action, skip
            pass
    
    # Timeout — max steps reached
    if status_fn:
        await status_fn("⏰ *Waktu habis — maksimal langkah tercapai.*")
    
    return {
        "success": False,
        "error": f"Max steps ({max_steps}) reached without completing goal",
        "history": history,
        "last_url": ss.get("url", "") if 'ss' in locals() else "",
    }
