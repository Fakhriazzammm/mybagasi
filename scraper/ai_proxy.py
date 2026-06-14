"""AI Proxy — routes /api/ai/chat through the backend to Sumopod (same as bot Telegram)
so browser-side CORS issues are avoided. The API key lives server-side only.
"""
import os, json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx

router = APIRouter(prefix="/ai")

SUMOPOD_API_KEY = os.getenv("SUMOPOD_API_KEY", "")
SUMOPOD_BASE = (os.getenv("SUMOPOD_BASE_URL") or "https://ai.sumopod.com/v1").rstrip("/")
DEFAULT_MODEL = os.getenv("AI_MODEL") or os.getenv("SUMOPOD_MODEL") or "gemini/gemini-2.5-flash"
APP_BASE_URL = (os.getenv("VITE_APP_BASE_URL") or "").rstrip("/")

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    max_tokens: int = 700
    temperature: float = 0.7
    stream: bool = False

class ChatResponse(BaseModel):
    success: bool
    content: str = ""
    error: Optional[str] = None


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(req: ChatRequest):
    if not SUMOPOD_API_KEY:
        return ChatResponse(success=False, error="AI API key tidak dikonfigurasi di server.")

    msgs = []
    if req.system_prompt:
        msgs.append({"role": "system", "content": req.system_prompt})
    msgs.extend([m.model_dump() for m in req.messages])

    body = {
        "model": req.model or DEFAULT_MODEL,
        "messages": msgs,
        "max_tokens": req.max_tokens,
        "temperature": req.temperature,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{SUMOPOD_BASE}/chat/completions",
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {SUMOPOD_API_KEY}",
                },
            )
            if resp.status_code != 200:
                err_text = resp.text[:500]
                return ChatResponse(success=False, error=f"AI API error {resp.status_code}: {err_text}")

            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return ChatResponse(success=True, content=content)

    except httpx.TimeoutException:
        return ChatResponse(success=False, error="AI API timeout — coba lagi.")
    except Exception as e:
        return ChatResponse(success=False, error=f"AI proxy error: {str(e)}")
