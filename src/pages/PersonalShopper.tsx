import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles, Send, ShoppingBag, Loader2, ArrowRight, Bell, Bookmark,
  ExternalLink, StopCircle, User as UserIcon, Copy, Check,
} from "lucide-react";
import { toast } from "sonner";
import { scrapeProduct, searchProducts, type ProductData } from "@/lib/scraper";
import { estimateAllInFromJPY, streamChatCompletion, type ChatMessage } from "@/lib/ai";
import { fmtRp, fmtJpy } from "@/lib/format";
import { appConfig } from "@/lib/runtime-config";
import { quotationsService } from "@/services/quotations.service";
import { wishlistService, priceAlertsService } from "@/services/wishlist.service";
import { ordersService } from "@/services/orders.service";

// ─── Types ───────────────────────────────────────────────────────────────────

type Quote = {
  product: string;
  productJpy: number;
  rate: number;
  fee: number;
  shipping: number;
  tax: number;
  membershipDiscount: number;
  pointsUsed: number;
  source?: string;
  url?: string;
};

type ChatMsg = {
  id: number;
  role: "user" | "ai";
  content: string;
  isStreaming?: boolean;
  quote?: Quote;
  quotationId?: string;
  searchResults?: ProductData[];
  error?: string;
  productUrl?: string;
  time?: string;
};

// ─── Config ──────────────────────────────────────────────────────────────────

const JPY_TO_IDR = appConfig.pricing.jpyToIdr;
const SERVICE_FEE_RATE = appConfig.pricing.serviceFeeRate;
const TAX_RATE = appConfig.pricing.taxRate;
const API_KEY =
  (import.meta.env.VITE_SUMOPOD_API_KEY as string | undefined) ??
  (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ??
  "";

const AI_SYSTEM_PROMPT = `Kamu adalah MyBagasi AI, asisten personal shopper untuk produk Jepang.
Kamu membantu pelanggan Indonesia menemukan produk dari marketplace Jepang (Mercari, Rakuten, Amazon JP, Yahoo Auction).
Gunakan bahasa Indonesia yang ramah dan santai. Jawab singkat dan to the point.

PENTING:
- Jika user memberikan link produk, beritahu bahwa kamu akan membaca detailnya.
- Jika user menanyakan harga, berikan estimasi all-in jika kamu punya data produk.
- Jangan pernah membuat data produk palsu.
- Jika tidak punya data produk yang cukup, arahkan user untuk paste link produk.`;

const SUGGESTIONS = [
  "Cari Onitsuka Tiger Mexico 66 size 42",
  "Berapa harga kamera Fujifilm X100V dari Jepang?",
  "https://jp.mercari.com/item/m1234567890",
];

const now = () =>
  new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

// ─── Simple markdown → HTML (lightweight, no deps) ──────────────────────────

function renderMarkdown(text: string): string {
  let html = text
    // Code blocks first (before other formatting)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="bg-muted/80 border border-border/50 rounded-xl p-4 my-3 overflow-x-auto text-xs leading-relaxed"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-muted/60 px-1.5 py-0.5 rounded-md text-xs font-mono">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Bullet points (lines starting with - or *)
    .replace(/^[-*]\s+(.+)$/gm, '<span class="block pl-4 relative before:content-["•"] before:absolute before:left-0 before:text-primary">$1</span>')
    // Numbered lists
    .replace(/^\d+\.\s+(.+)$/gm, '<span class="block pl-4">$1</span>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline decoration-primary/30 hover:decoration-primary">$1</a>')
    // Line breaks
    .replace(/\n\n/g, "</p><p class=\"mb-2\">")
    .replace(/\n/g, "<br />");

  return `<p class="mb-2">${html}</p>`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const PersonalShopper = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState(searchParams.get("url") ?? searchParams.get("query") ?? "");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasApiKey = Boolean(API_KEY?.trim());

  // Auto-scroll on new messages / streaming
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [msgs]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-send from URL params
  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam) {
      const timer = setTimeout(() => handleSend(urlParam), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  // ─── Handle Send ───────────────────────────────────────────────────────

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // Stop any existing stream
    abortController?.abort();

    const userMsg: ChatMsg = { id: Date.now(), role: "user", content: trimmed, time: now() };
    const aiMsgId = Date.now() + 1;
    const aiMsg: ChatMsg = { id: aiMsgId, role: "ai", content: "", isStreaming: true, time: now() };

    setMsgs((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const isUrl = /^https?:\/\//i.test(trimmed);

      if (isUrl) {
        // ── URL mode: scrape → quote ──
        setMsgs((prev) => prev.map((m) =>
          m.id === aiMsgId ? { ...m, content: "🔍 Membaca link produk..." } : m
        ));

        const scraped = await scrapeProduct(trimmed);
        const productJpy = scraped.price_jpy ?? 0;
        const productName = scraped.title || "Produk dari " + scraped.marketplace;
        const source = scraped.marketplace;

        if (!productJpy || productJpy < 100) {
          setMsgs((prev) => prev.map((m) =>
            m.id === aiMsgId ? {
              ...m, content: "Maaf, saya belum bisa membaca harga dari link tersebut. Pastikan link produk valid dan masih tersedia.",
              isStreaming: false, error: "Harga tidak terbaca",
            } : m
          ));
          setLoading(false);
          return;
        }

        const estimate = estimateAllInFromJPY(productJpy);
        const productIdr = Math.round(productJpy * JPY_TO_IDR);

        const quote: Quote = {
          product: productName, productJpy, rate: JPY_TO_IDR,
          fee: estimate.serviceFee, shipping: estimate.shipping, tax: estimate.tax,
          membershipDiscount: Math.round(productIdr * 0.03),
          pointsUsed: productJpy > 20000 ? 12000 : 5000,
          source, url: trimmed,
        };

        const saved = await quotationsService.create({
          product: quote.product, url: trimmed, source: quote.source,
          price_jpy: quote.productJpy, exchange_rate: quote.rate,
          service_fee: quote.fee, shipping_cost: quote.shipping,
          tax_customs: quote.tax, membership_discount: quote.membershipDiscount,
          points_used: quote.pointsUsed,
          total: Math.max(0, (quote.productJpy * quote.rate) + quote.fee + quote.shipping + quote.tax - quote.membershipDiscount - quote.pointsUsed),
        });

        // Stream AI response about the product
        const aiMessages: ChatMessage[] = [
          { role: "user", content: `Saya menemukan produk ini: ${productName} dari ${source}, harga JPY ${productJpy}. Beri respons singkat dan informatif.` }
        ];

        let aiContent = "";
        try {
          const stream = streamChatCompletion(aiMessages, API_KEY, { systemPrompt: AI_SYSTEM_PROMPT, maxTokens: 400 });
          for await (const chunk of stream) {
            if (chunk.type === "content") {
              aiContent += chunk.text;
              setMsgs((prev) => prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: aiContent } : m
              ));
            }
          }
        } catch {
          // Stream finished or failed
        }

        setMsgs((prev) => prev.map((m) =>
          m.id === aiMsgId ? {
            ...m, content: aiContent || `Berikut detail produk yang saya temukan:`,
            isStreaming: false, quote, quotationId: saved.id, productUrl: trimmed,
          } : m
        ));
        toast.success("Quotation tersimpan!");
      } else {
        // ── Keyword mode: search → quote ──
        setMsgs((prev) => prev.map((m) =>
          m.id === aiMsgId ? { ...m, content: "🔍 Mencari di marketplace Jepang..." } : m
        ));

        const results = await searchProducts({ keyword: trimmed, limit: 6 });

        if (!results || results.length === 0) {
          // Streaming fallback response
          const fallbackMsgs: ChatMessage[] = [
            { role: "user", content: `Saya mencari "${trimmed}" di marketplace Jepang tapi tidak menemukan hasil yang cocok. Beri saran kata kunci yang lebih spesifik atau cara lain yang bisa saya coba.` }
          ];

          let fbContent = "";
          try {
            const fbStream = streamChatCompletion(fallbackMsgs, API_KEY, { systemPrompt: AI_SYSTEM_PROMPT, maxTokens: 300 });
            for await (const chunk of fbStream) {
              if (chunk.type === "content") {
                fbContent += chunk.text;
                setMsgs((prev) => prev.map((m) =>
                  m.id === aiMsgId ? { ...m, content: fbContent } : m
                ));
              }
            }
          } catch {}
          setMsgs((prev) => prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: fbContent || "Pencarian tidak menemukan hasil. Coba kata kunci lebih spesifik.", isStreaming: false, error: "Tidak ditemukan" } : m
          ));
          setLoading(false);
          return;
        }

        const first = results[0];
        const productJpy = first.price_jpy ?? 0;

        if (productJpy > 0) {
          const estimate = estimateAllInFromJPY(productJpy);
          const productIdr = Math.round(productJpy * JPY_TO_IDR);

          const quote: Quote = {
            product: first.title || trimmed, productJpy, rate: JPY_TO_IDR,
            fee: estimate.serviceFee, shipping: estimate.shipping, tax: estimate.tax,
            membershipDiscount: Math.round(productIdr * 0.03),
            pointsUsed: productJpy > 20000 ? 12000 : 5000,
            source: first.marketplace, url: first.url ?? undefined,
          };

          const saved = await quotationsService.create({
            product: quote.product, url: first.url, source: quote.source,
            price_jpy: quote.productJpy, exchange_rate: quote.rate,
            service_fee: quote.fee, shipping_cost: quote.shipping,
            tax_customs: quote.tax, membership_discount: quote.membershipDiscount,
            points_used: quote.pointsUsed,
            total: Math.max(0, (quote.productJpy * quote.rate) + quote.fee + quote.shipping + quote.tax - quote.membershipDiscount - quote.pointsUsed),
          });

          // Stream AI response
          const aiMsgs: ChatMessage[] = [
            { role: "user", content: `Saya menemukan ${results.length} produk untuk "${trimmed}". Produk terbaik: ${first.title || trimmed} dari ${first.marketplace} harga JPY ${productJpy}. Beri respons singkat.` }
          ];

          let aiContent = "";
          try {
            const aiStream = streamChatCompletion(aiMsgs, API_KEY, { systemPrompt: AI_SYSTEM_PROMPT, maxTokens: 400 });
            for await (const chunk of aiStream) {
              if (chunk.type === "content") {
                aiContent += chunk.text;
                setMsgs((prev) => prev.map((m) =>
                  m.id === aiMsgId ? { ...m, content: aiContent } : m
                ));
              }
            }
          } catch {}

          setMsgs((prev) => prev.map((m) =>
            m.id === aiMsgId ? {
              ...m, content: aiContent || `Saya temukan ${results.length} produk!`,
              isStreaming: false, quote, quotationId: saved.id,
              searchResults: results, productUrl: first.url ?? undefined,
            } : m
          ));
          toast.success(`Ditemukan ${results.length} produk!`);
        } else {
          setMsgs((prev) => prev.map((m) =>
            m.id === aiMsgId ? {
              ...m, content: `Produk ditemukan tapi detail harga belum terbaca. Coba kirim link langsung dari marketplace.`,
              isStreaming: false, searchResults: results,
            } : m
          ));
        }
      }
    } catch (err: any) {
      const errMsg = err.message || "Terjadi error";
      setMsgs((prev) => prev.map((m) =>
        m.id === aiMsgId ? { ...m, content: `Maaf, ada kendala: ${errMsg}`, isStreaming: false, error: errMsg } : m
      ));
    } finally {
      setLoading(false);
      setAbortController(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading, abortController]);

  const stopStreaming = () => {
    abortController?.abort();
    setMsgs((prev) => prev.map((m) =>
      m.isStreaming ? { ...m, isStreaming: false } : m
    ));
    setLoading(false);
  };

  // ─── Actions ──────────────────────────────────────────────────────────

  const totalPrice = (q: Quote) =>
    Math.max(0, (q.productJpy * q.rate) + q.fee + q.shipping + q.tax - q.membershipDiscount - q.pointsUsed);

  const continueBuy = async (quote: Quote, quotationId?: string) => {
    if (!quote) return;
    setActionLoading("buy_" + (quotationId ?? "new"));
    try {
      const total = totalPrice(quote);
      const order = await ordersService.create({
        quotation_id: quotationId ?? undefined,
        product: quote.product, source: quote.source,
        price_jpy: quote.productJpy, exchange_rate: quote.rate,
        service_fee: quote.fee, shipping_cost: quote.shipping,
        tax_customs: quote.tax, membership_discount: quote.membershipDiscount,
        points_used: quote.pointsUsed, total,
        notes: quote.url ? `Sumber: ${quote.url}` : undefined,
      });
      if (quotationId) await quotationsService.markConverted(quotationId);
      toast.success("Order draft dibuat!");
      navigate(`/checkout?order_id=${order.id}&from=/aipersonalshopper`);
    } catch (err: any) { toast.error("Gagal", { description: err.message }); }
    finally { setActionLoading(null); }
  };

  const saveWishlist = async (quote: Quote) => {
    if (!quote) return;
    setActionLoading("wish");
    try {
      const total = totalPrice(quote);
      const productIdr = Math.round(quote.productJpy * quote.rate);
      await wishlistService.add({
        emoji: "🛍️", name: quote.product, url: quote.url || null,
        price_idr: productIdr || total, source: quote.source ?? null,
        note: "Dari AI Personal Shopper",
      });
      toast.success("Tersimpan ke wishlist!");
    } catch (err: any) { toast.error("Gagal", { description: err.message }); }
    finally { setActionLoading(null); }
  };

  const copyText = async (text: string, id: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─── Render Quote Card ─────────────────────────────────────────────────

  const renderQuoteCard = (msg: ChatMsg) => {
    if (!msg.quote) return null;
    const q = msg.quote;
    const total = totalPrice(q);
    const productIdr = Math.round(q.productJpy * q.rate);

    return (
      <div className="my-3 rounded-2xl border border-border/40 bg-card shadow-soft overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 p-4 pb-3">
          <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimasi Harga</p>
            <p className="font-semibold text-sm truncate">{q.product}</p>
            {q.source && (
              <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] px-2 py-0.5 rounded-full bg-primary-soft text-primary font-medium">
                {q.source}
              </span>
            )}
          </div>
        </div>

        {/* Search results */}
        {msg.searchResults && msg.searchResults.length > 1 && (
          <div className="mx-4 mb-3 rounded-xl bg-muted/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              {msg.searchResults.length} produk ditemukan
            </p>
            <div className="max-h-28 overflow-y-auto space-y-1">
              {msg.searchResults.map((r, i) => (
                <div key={i} className={`text-xs flex justify-between p-1.5 rounded-lg ${i === 0 ? "bg-primary/10 font-semibold" : "text-muted-foreground"}`}>
                  <span className="truncate mr-2">{r.title || r.marketplace}</span>
                  <span className="shrink-0">{r.price_jpy ? fmtJpy(r.price_jpy) : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Price breakdown */}
        {q.productJpy > 0 && (
          <>
            <div className="px-4 pb-1 space-y-1.5 text-xs">
              {[
                ["Harga Produk", `${fmtJpy(q.productJpy)} · ${fmtRp(productIdr)}`],
                [`Jasa MyBagasi (${(SERVICE_FEE_RATE * 100).toFixed(0)}%)`, fmtRp(q.fee)],
                ["Ongkir Jepang → Indo", fmtRp(q.shipping)],
                ["Pajak & Bea Cukai", fmtRp(q.tax)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-muted-foreground">
                  <span>{k}</span>
                  <span className="text-foreground font-medium">{v}</span>
                </div>
              ))}
              {q.membershipDiscount > 0 && (
                <div className="flex justify-between text-success">
                  <span>Diskon membership</span>
                  <span className="font-medium">−{fmtRp(q.membershipDiscount)}</span>
                </div>
              )}
              {q.pointsUsed > 0 && (
                <div className="flex justify-between text-success">
                  <span>Poin terpakai</span>
                  <span className="font-medium">−{fmtRp(q.pointsUsed)}</span>
                </div>
              )}
            </div>

            <div className="mx-4 my-3 pt-3 border-t border-border/60 flex items-end justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground">Total All-in</p>
                <p className="font-display text-xl md:text-2xl font-bold text-primary">{fmtRp(total)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground text-right">
                Estimasi sampai<br />
                <span className="font-semibold text-foreground">7–14 hari</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-4 pt-2 border-t border-border/40 bg-muted/20">
              <Button size="sm" variant="hero" className="gap-1.5" onClick={() => continueBuy(q, msg.quotationId)} disabled={!!actionLoading}>
                {actionLoading?.startsWith("buy") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingBag className="h-3.5 w-3.5" />}
                Lanjut Beli
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => saveWishlist(q)} disabled={!!actionLoading}>
                <Bookmark className="h-3.5 w-3.5" /> Simpan
              </Button>
              <Button size="sm" variant="soft" className="gap-1.5" onClick={() => {
                const target = window.prompt("Target harga (IDR)", String(Math.round(total * 0.9)));
                if (target) {
                  const num = Number(target.replace(/[^0-9]/g, ""));
                  if (num) {
                    priceAlertsService.create({ product: q.product, url: q.url || null, current_price: total, target_price: num });
                    toast.success("Price alert aktif!");
                  }
                }
              }} disabled={!!actionLoading}>
                <Bell className="h-3.5 w-3.5" /> Pantau
              </Button>
              {q.url && (
                <Button size="sm" variant="ghost" className="gap-1.5" asChild>
                  <a href={q.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Buka
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // ─── Render Message ───────────────────────────────────────────────────

  const renderMessage = (msg: ChatMsg) => {
    const isUser = msg.role === "user";
    const isAi = msg.role === "ai";

    return (
      <div
        key={msg.id}
        className={`flex gap-3 w-full ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
      >
        {/* AI Avatar */}
        {isAi && (
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary grid place-items-center text-primary-foreground shadow-sm mt-0.5">
            <Sparkles className="h-4 w-4" />
          </div>
        )}

        <div className={`max-w-[85%] md:max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
          {/* User Bubble */}
          {isUser && (
            <div className="rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm shadow-sm">
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          )}

          {/* AI Content */}
          {isAi && (
            <div className="w-full">
              <div className="rounded-2xl rounded-bl-sm bg-card border border-border/40 px-4 py-3 text-sm shadow-sm">
                {msg.isStreaming && !msg.content ? (
                  <div className="flex gap-1.5 items-center h-5">
                    {[0, 200, 400].map((d) => (
                      <span key={d} className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                ) : (
                  <>
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert prose-a:text-primary prose-code:bg-muted/60 prose-code:px-1 prose-code:rounded prose-pre:bg-transparent prose-pre:p-0 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                    {msg.isStreaming && (
                      <span className="inline-block w-2 h-4 bg-primary/70 ml-0.5 animate-pulse rounded-sm" />
                    )}
                  </>
                )}

                {/* Error badge */}
                {msg.error && !msg.isStreaming && (
                  <div className="mt-2 text-[10px] text-muted-foreground bg-destructive/5 rounded-lg px-2 py-1">
                    ⚠️ {msg.error}
                  </div>
                )}
              </div>

              {/* Product card */}
              {msg.quote && renderQuoteCard(msg)}

              {/* Actions bar */}
              {!msg.isStreaming && msg.content && (
                <div className="flex items-center gap-1 mt-1.5 px-1">
                  <button
                    onClick={() => copyText(msg.content, msg.id)}
                    className="h-6 w-6 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors grid place-items-center"
                    title="Salin teks"
                  >
                    {copiedId === msg.id ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                  </button>
                  <span className="text-[10px] text-muted-foreground/40 ml-auto">{msg.time}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Avatar */}
        {isUser && (
          <div className="h-8 w-8 shrink-0 rounded-full bg-secondary grid place-items-center text-muted-foreground shadow-sm mt-0.5">
            <UserIcon className="h-4 w-4" />
          </div>
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 pb-4">
        {/* Header */}
        <div className="text-center py-4 md:py-6 shrink-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-soft border border-primary/20 text-xs font-medium text-primary mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            AI Personal Shopper
          </div>
          <h1 className="font-display text-xl md:text-2xl font-bold mb-1">
            Belanja dari Jepang, tanya AI
          </h1>
          <p className="text-xs text-muted-foreground">
            Paste link atau ketik produk — langsung dihitung all-in
          </p>
        </div>

        {/* Chat container */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-4 px-1 pb-2 scroll-smooth"
          style={{ maxHeight: "calc(100vh - 320px)" }}
        >
          {/* Welcome */}
          {msgs.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4 py-8">
              <div className="h-14 w-14 rounded-2xl bg-gradient-warm text-primary grid place-items-center shadow-soft animate-float">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="max-w-sm">
                <p className="font-display text-lg font-bold mb-1">Halo! 👋</p>
                <p className="text-sm text-muted-foreground">
                  Mau cari atau cek harga barang dari Jepang? Paste link, ketik nama produk, atau tanya aja.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="text-xs px-3.5 py-2 rounded-xl border border-border/60 bg-card hover:bg-muted hover:border-primary/30 transition-all"
                  >
                    {s.startsWith("http") ? "🔗 Paste link produk" : s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {msgs.map(renderMessage)}
        </div>

        {/* Input bar */}
        <div className="shrink-0 mt-3 flex items-end gap-2 bg-card border border-border/40 rounded-2xl p-2 shadow-soft">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            placeholder={hasApiKey ? "Paste link atau ketik produk..." : "AI API key belum dikonfigurasi"}
            disabled={loading || !hasApiKey}
            className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm placeholder:text-muted-foreground/50"
          />
          {loading ? (
            <Button
              onClick={stopStreaming}
              size="sm"
              variant="destructive"
              className="h-9 w-9 p-0 shrink-0 rounded-xl"
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => handleSend(input)}
              disabled={!input.trim() || !hasApiKey}
              size="sm"
              variant="hero"
              className="h-9 w-9 p-0 shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* API key warning */}
        {!hasApiKey && (
          <div className="mt-2 rounded-xl bg-warning/10 border border-warning/20 px-3 py-2 text-[11px] text-warning-foreground text-center">
            VITE_SUMOPOD_API_KEY belum diatur — AI chat tidak aktif
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default PersonalShopper;
