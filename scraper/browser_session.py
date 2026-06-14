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

async def navigate(chat_id: int, url: str, timeout: int = 30) -> dict[str, Any]:
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
