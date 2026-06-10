// ============================================================
// send-order-update — Supabase Edge Function
// Kirim notifikasi order update ke Telegram
// ============================================================
// Dipanggil via webhook HTTP POST
// Payload: { order_id, user_id, old_status, new_status, product, tracking_number, note }
//
// Env vars (set via Supabase Dashboard → Edge Functions):
//   SUPABASE_URL            — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — harus di-set manual
//   TELEGRAM_BOT_TOKEN      — token bot Telegram
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ─────────────── Status → Emoji Mapping ───────────────
const STATUS_EMOJI: Record<string, string> = {
  draft: "\u{1F4DD}",              // 📝
  quote_created: "\u{1F4B0}",      // 💰
  waiting_payment: "\u{23F3}",     // ⏳
  paid: "\u{2705}",                // ✅
  procurement_queue: "\u{1F4CB}",  // 📋
  purchased: "\u{1F6D2}",          // 🛒
  in_japan_warehouse: "\u{1F3ED}", // 🏭
  packed: "\u{1F4E6}",            // 📦
  shipped_to_indonesia: "\u{1F6A2}", // 🚢
  customs_clearance: "\u{1F6C3}",  // 🛃
  last_mile_delivery: "\u{1F69A}", // 🚚
  delivered: "\u{1F389}",          // 🎉
  cancelled: "\u{274C}",           // ❌
  refunded: "\u{1F4B5}",          // 💵
}

// ─────────────── Status → Label (Bahasa Indonesia) ─────
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  quote_created: "Penawaran Dibuat",
  waiting_payment: "Menunggu Pembayaran",
  paid: "Dibayar",
  procurement_queue: "Antrian Procurement",
  purchased: "Dibeli",
  in_japan_warehouse: "Di Gudang Jepang",
  packed: "Dikemas",
  shipped_to_indonesia: "Dikirim ke Indonesia",
  customs_clearance: "Bea Cukai",
  last_mile_delivery: "Pengiriman Lokal",
  delivered: "Terkirim \u{1F389}",
  cancelled: "Dibatalkan",
  refunded: "Dikembalikan",
}

// ─────────────── Payload ───────────────
interface OrderUpdatePayload {
  order_id: string
  user_id: string
  old_status: string
  new_status: string
  product?: string
  tracking_number?: string
  note?: string
}

// ─────────────── Format pesan Telegram ───────────────
function formatTelegramMessage(payload: OrderUpdatePayload): string {
  const emoji = STATUS_EMOJI[payload.new_status] || "\u{1F6A8}" // 🚨 fallback
  const label = STATUS_LABEL[payload.new_status] || payload.new_status
  const oldLabel = STATUS_LABEL[payload.old_status] || payload.old_status

  const lines: string[] = [
    `${emoji} *Update Status Pesanan*`,
    "",
    `*Pesanan:* ${payload.order_id}`,
    `*Produk:* ${payload.product || "-"}`,
    `*Status:* ${oldLabel} \u{2192} ${label}`,
  ]

  if (payload.tracking_number) {
    lines.push(`*No. Resi:* \`${payload.tracking_number}\``)
  }

  if (payload.note) {
    lines.push(`*Catatan:* ${payload.note}`)
  }

  lines.push("", "\u{1F4E6} *MyBagasi* \u{2014} Pantau pesananmu kapan saja.")

  return lines.join("\n")
}

// ─────────────── Handler ───────────────
serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    // ── Parse payload ──
    const payload: OrderUpdatePayload = await req.json()

    if (!payload.user_id || !payload.new_status) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id, new_status" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    // ── Init Supabase client ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? ""

    if (!supabaseUrl || !supabaseKey || !botToken) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })

    // ── Fetch telegram_id from profiles ──
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("telegram_id")
      .eq("id", payload.user_id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({
          error: "User not found or no telegram_id",
          detail: profileError?.message ?? null,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      )
    }

    const telegramId = profile.telegram_id
    if (!telegramId) {
      return new Response(
        JSON.stringify({ error: "User has no telegram_id linked" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    // ── Format & send Telegram message ──
    const message = formatTelegramMessage(payload)

    const tgResp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramId,
          text: message,
          parse_mode: "Markdown",
        }),
      },
    )

    const tgResult = await tgResp.json()

    if (!tgResp.ok) {
      return new Response(
        JSON.stringify({
          error: "Telegram API error",
          detail: tgResult,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      )
    }

    // ── Success ──
    return new Response(
      JSON.stringify({
        success: true,
        telegram_message_id: tgResult.result?.message_id ?? null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
})
