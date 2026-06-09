import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, ShoppingBag, Loader2, ArrowRight, Bell, Bookmark, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { scrapeProduct, searchProducts, type ProductData } from "@/lib/scraper";
import { estimateAllInFromJPY } from "@/lib/ai";
import { fmtRp, fmtJpy } from "@/lib/format";
import { appConfig } from "@/lib/runtime-config";
import { quotationsService } from "@/services/quotations.service";
import { wishlistService, priceAlertsService } from "@/services/wishlist.service";
import { ordersService } from "@/services/orders.service";

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
  role: "ai" | "user";
  content: string;
  quote?: Quote;
  quotationId?: string;
  searchResults?: ProductData[];
  error?: string;
};

const JPY_TO_IDR = appConfig.pricing.jpyToIdr;
const SERVICE_FEE_RATE = appConfig.pricing.serviceFeeRate;
const SHIPPING_IDR = appConfig.pricing.shippingIdr;
const TAX_RATE = appConfig.pricing.taxRate;

const SUGGESTIONS = [
  "Cari Onitsuka Tiger Mexico 66 size 42 di Mercari",
  "Berapa estimasi kamera Fujifilm X100V + ongkir?",
  "https://jp.mercari.com/item/m1234567890",
];

const now = () =>
  new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

const PersonalShopper = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState(searchParams.get("url") ?? searchParams.get("query") ?? "");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const scrollRef = useState<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      document.getElementById("chat-end")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  // Auto-send if URL param present
  useEffect(() => {
    const urlParam = searchParams.get("url");
    const queryParam = searchParams.get("query");
    if (urlParam || queryParam) {
      const text = urlParam || queryParam || "";
      // Small delay to let page render
      const timer = setTimeout(() => handleSend(text), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMsg = { id: Date.now(), role: "user", content: trimmed, time: now() };
    setMsgs((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const isUrl = /^https?:\/\//i.test(trimmed);

      if (isUrl) {
        const scraped = await scrapeProduct(trimmed);
        const productJpy = scraped.price_jpy ?? 0;
        const productName = scraped.title || "Produk dari " + scraped.marketplace;
        const source = scraped.marketplace;

        if (!productJpy || productJpy < 100) {
          setMsgs((m) => [...m, {
            id: Date.now() + 1, role: "ai", time: now(),
            content: "Maaf, saya belum bisa membaca harga dari link tersebut. Pastikan link produk valid dan masih tersedia. Atau coba cari dengan nama produk saja.",
            error: "Harga tidak terbaca",
          }]);
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

        setMsgs((m) => [...m, {
          id: Date.now() + 1, role: "ai", time: now(),
          content: `Saya berhasil membaca detail produk dari link yang kamu kirim! Berikut estimasi lengkapnya:`,
          quote, quotationId: saved.id,
        }]);
        toast.success("Quotation tersimpan!");
      } else {
        // Keyword search
        const results = await searchProducts({ keyword: trimmed, limit: 6 });

        if (!results || results.length === 0) {
          setMsgs((m) => [...m, {
            id: Date.now() + 1, role: "ai", time: now(),
            content: "Pencarian di marketplace Jepang belum menemukan produk yang cocok. Coba kata kunci yang lebih spesifik, atau share langsung link produk yang kamu mau.",
            error: "Tidak ditemukan",
          }]);
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

          const foundMsg = results.length > 1
            ? `Saya menemukan ${results.length} produk dari marketplace Jepang. Berikut yang paling cocok:`
            : "Saya menemukan produk ini:";

          setMsgs((m) => [...m, {
            id: Date.now() + 1, role: "ai", time: now(),
            content: foundMsg,
            quote, quotationId: saved.id,
            searchResults: results,
          }]);
          toast.success(`Ditemukan ${results.length} produk!`);
        } else {
          setMsgs((m) => [...m, {
            id: Date.now() + 1, role: "ai", time: now(),
            content: `Produk ditemukan tapi harga belum terbaca otomatis. Coba kirim link langsung dari marketplace untuk hasil lebih akurat.`,
            searchResults: results,
          }]);
        }
      }
    } catch (err: any) {
      const msg = err.message || "Terjadi error";
      setMsgs((m) => [...m, {
        id: Date.now() + 1, role: "ai", time: now(),
        content: `Maaf, ada kendala: ${msg}`,
        error: msg,
      }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const continueBuy = async (quote: Quote, quotationId?: string) => {
    if (!quote) return;
    setActionLoading("buy");
    try {
      const total = Math.max(0, (quote.productJpy * quote.rate) + quote.fee + quote.shipping + quote.tax - quote.membershipDiscount - quote.pointsUsed);
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
    setActionLoading("wishlist");
    try {
      const productIdr = Math.round(quote.productJpy * quote.rate);
      const total = Math.max(0, (quote.productJpy * quote.rate) + quote.fee + quote.shipping + quote.tax - quote.membershipDiscount - quote.pointsUsed);
      await wishlistService.add({
        emoji: "🛍️", name: quote.product, url: quote.url || null,
        price_idr: productIdr || total, source: quote.source ?? null,
      });
      toast.success("Tersimpan ke wishlist!");
    } catch (err: any) { toast.error("Gagal", { description: err.message }); }
    finally { setActionLoading(null); }
  };

  const totalPrice = (q: Quote) =>
    Math.max(0, (q.productJpy * q.rate) + q.fee + q.shipping + q.tax - q.membershipDiscount - q.pointsUsed);

  const renderQuote = (msg: ChatMsg) => {
    if (!msg.quote) return null;
    const q = msg.quote;
    const total = totalPrice(q);

    return (
      <div className="mt-3 rounded-2xl border border-border/40 bg-gradient-warm p-4 shadow-soft">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Estimasi Harga</p>
            <p className="font-semibold text-sm truncate">{q.product}</p>
            {q.source && <span className="text-[10px] text-muted-foreground">{q.source}</span>}
          </div>
        </div>

        {/* Search results comparison */}
        {msg.searchResults && msg.searchResults.length > 1 && (
          <div className="mb-3 rounded-xl bg-background/60 p-3">
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
            <div className="space-y-1.5 text-xs">
              {[
                ["Harga Produk", `${fmtJpy(q.productJpy)} · ${fmtRp(Math.round(q.productJpy * q.rate))}`],
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

            <div className="mt-4 pt-4 border-t border-border/60 flex items-end justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground">Total All-in</p>
                <p className="font-display text-2xl font-bold text-primary">{fmtRp(total)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground text-right">
                Estimasi sampai<br />
                <span className="font-semibold text-foreground">7–14 hari</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <Button size="sm" variant="hero" onClick={() => continueBuy(q, msg.quotationId)} disabled={!!actionLoading}>
                {actionLoading === "buy" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShoppingBag className="h-3.5 w-3.5" />}
                Lanjut Beli
              </Button>
              <Button size="sm" variant="outline" onClick={() => saveWishlist(q)} disabled={!!actionLoading}>
                <Bookmark className="h-3.5 w-3.5" /> Simpan
              </Button>
              <Button size="sm" variant="soft" onClick={() => {
                const target = window.prompt("Target harga IDR", String(Math.round(total * 0.9)));
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
                <Button size="sm" variant="ghost" asChild>
                  <a href={q.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Lihat
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6 md:py-10">
        <div className="mx-auto w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-soft border border-primary/20 text-xs font-medium text-primary mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              AI Personal Shopper
            </div>
            <h1 className="font-display text-2xl md:text-4xl font-bold mb-2">
              Cari & hitung harga barang Jepang
            </h1>
            <p className="text-sm text-muted-foreground">
              Paste link Mercari/Rakuten/Amazon JP atau ketik nama produk. AI langsung cari dan kasih estimasi all-in.
            </p>
          </div>

          {/* Chat area */}
          <div
            className="flex flex-col rounded-3xl border border-border/40 shadow-soft overflow-hidden bg-card"
            style={{ height: "calc(100vh - 340px)", minHeight: 420 }}
          >
            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
              {/* Welcome message */}
              {msgs.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
                  <div className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center animate-float">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-display text-lg font-bold mb-1">Halo! 👋 Ada yang bisa saya bantu?</p>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Cari produk Jepang, cek harga all-in, atau langsung checkout — semua lewat chat ini.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSend(s)}
                        className="text-xs px-4 py-2.5 rounded-xl border border-border/60 bg-background/80 hover:bg-background hover:border-primary/40 transition-colors"
                      >
                        {s.startsWith("http") ? "🔗 Paste link produk" : s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {msgs.map((m) => (
                <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "ai" && (
                    <div className="h-7 w-7 shrink-0 rounded-xl bg-primary text-primary-foreground grid place-items-center mt-0.5">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div className={`max-w-[85%] ${m.role === "user" ? "" : "flex-1"}`}>
                    <div className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm ml-auto w-fit"
                        : "bg-background text-foreground rounded-bl-sm border border-border/40"
                    }`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      {m.role === "user" && (
                        <p className="text-[10px] text-primary-foreground/60 text-right mt-1">{m.time}</p>
                      )}
                    </div>
                    {m.role === "ai" && renderQuote(m)}
                  </div>
                </div>
              ))}

              {/* Loading */}
              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="h-7 w-7 shrink-0 rounded-xl bg-primary text-primary-foreground grid place-items-center">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="bg-background rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-border/40">
                    <div className="flex gap-1.5 items-center h-4">
                      {[0, 150, 300].map((d) => (
                        <span key={d} className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-pulse-soft" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">Mencari & menghitung...</p>
                  </div>
                </div>
              )}
              <div id="chat-end" />
            </div>

            {/* Input */}
            <div className="border-t border-border/40 bg-card px-4 py-3 flex items-center gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey) && handleSend(input)}
                placeholder="Paste link produk atau ketik nama barang..."
                disabled={loading}
                className="flex-1 rounded-xl border-border/60 bg-muted/40 text-sm focus:border-primary/50"
              />
              <Button
                onClick={() => handleSend(input)}
                disabled={loading || !input.trim()}
                size="sm"
                variant="hero"
                className="h-9 px-3 shrink-0"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PersonalShopper;
