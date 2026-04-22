import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Send, Check, CheckCheck, Package, CreditCard, Plane, Home, Sparkles } from "lucide-react";
import { estimateAllInFromJPY, sendMessage, type ChatMessage } from "@/lib/ai";
import type { ProductData } from "@/lib/scraper";

const API_KEY = import.meta.env.VITE_SUMOPOD_API_KEY as string;

type Msg = {
  id: number;
  from: "user" | "bot";
  text?: string;
  card?: "quotation" | "payment" | "tracking" | "product" | "comparison";
  product?: ProductData;
  comparisons?: ComparisonItem[];
  time: string;
};

type FunnelState = "discovering" | "comparing" | "confirming" | "payment" | "post-payment";

type ComparisonItem = {
  title: string;
  marketplace: string;
  condition: string;
  price_jpy: number;
  price_display: string;
  total_estimated_idr: number;
};

const initialMsgs: Msg[] = [
  { id: 1, from: "bot", text: "Konnichiwa! 👋 Saya MyBagasi AI. Mau cari barang apa dari Jepang hari ini?", time: "10:00" },
];


const URL_REGEX = /https?:\/\//i;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createSearchAcknowledgement = () => {
  const variants = [
    "Siap, aku cek link produk kamu dulu ya 👀 Biasanya butuh sekitar 10–20 detik.",
    "Noted! Aku lagi membuka link dan mengambil detail produknya dulu ya ⏳ Tunggu sebentar, ya.",
    "Oke, aku proses link-nya dulu sekarang 🙌 Estimasi sekitar belasan detik.",
  ];

  const followUps = [
    "Sambil nunggu, kamu maunya kondisi baru saja atau second juga boleh?",
    "Biar aku carikan opsi terbaik, kamu prefer size/warna tertentu?",
    "Kalau stok di link habis, aku lanjut cari alternatif termurah juga ya?",
  ];

  return `${variants[Math.floor(Math.random() * variants.length)]}
${followUps[Math.floor(Math.random() * followUps.length)]}`;
};

const quickReplies = [
  "Belikan sepatu Onitsuka Tiger",
  "https://mercari.com/items/m12345",
  "Cari skincare Hada Labo",
  "Pre-order Pokemon card",
];

const QuotationCard = () => (
  <div className="rounded-2xl bg-background border border-border p-4 mt-2 shadow-soft">
    <div className="flex items-center gap-2 mb-3">
      <div className="h-9 w-9 rounded-xl bg-primary-soft grid place-items-center text-primary">
        <Sparkles className="h-4 w-4" />
      </div>
      <div>
        <p className="font-semibold text-sm">Quotation #Q-1287</p>
        <p className="text-[11px] text-muted-foreground">Onitsuka Tiger Mexico 66</p>
      </div>
    </div>
    <div className="space-y-1.5 text-xs border-t border-border/60 pt-3">
      {[
        ["Harga produk", "¥9.800 (Rp 1.029.000)"],
        ["Fee jasa MyBagasi", "Rp 154.000"],
        ["Ongkir Jepang→Indo", "Rp 285.000"],
        ["Pajak & bea", "Rp 124.000"],
        ["Diskon Plus", "−Rp 45.000"],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between text-muted-foreground">
          <span>{k}</span><span className="text-foreground">{v}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-border/60 pt-2 mt-2 font-bold">
        <span>Total all-in</span>
        <span className="text-primary">Rp 1.547.000</span>
      </div>
    </div>
    <div className="flex gap-2 mt-3">
      <Button size="sm" variant="hero" className="flex-1">Lanjut Beli</Button>
      <Button size="sm" variant="outline">Simpan</Button>
    </div>
  </div>
);

const PaymentCard = () => (
  <div className="rounded-2xl bg-background border border-border p-4 mt-2 shadow-soft">
    <div className="flex items-center gap-2 mb-3">
      <div className="h-9 w-9 rounded-xl bg-success/15 grid place-items-center text-success">
        <CreditCard className="h-4 w-4" />
      </div>
      <div>
        <p className="font-semibold text-sm">Pembayaran berhasil ✓</p>
        <p className="text-[11px] text-muted-foreground">VA BCA — Rp 1.547.000</p>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">Order #ORD-8821 masuk antrian procurement.</p>
  </div>
);

const TrackingCard = () => {
  const steps = [
    { icon: Check, label: "Dibayar", done: true },
    { icon: Package, label: "Dibeli di Jepang", done: true },
    { icon: Plane, label: "Dalam pengiriman", done: true, current: true },
    { icon: Home, label: "Sampai rumah", done: false },
  ];
  return (
    <div className="rounded-2xl bg-background border border-border p-4 mt-2 shadow-soft">
      <p className="font-semibold text-sm mb-3">Tracking #ORD-8821</p>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-3 items-center">
            <div className={`h-8 w-8 rounded-full grid place-items-center ${
              s.current ? "bg-primary text-primary-foreground animate-pulse-soft"
              : s.done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}>
              <s.icon className="h-4 w-4" />
            </div>
            <span className={`text-xs ${s.done ? "font-semibold" : "text-muted-foreground"}`}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProductCard = ({
  product,
  onAskCheaper,
}: {
  product: ProductData;
  onAskCheaper: (product: ProductData) => void;
}) => (
  <div className="rounded-2xl bg-background border border-border p-3 mt-2 shadow-soft space-y-2">
    {product.images?.[0] && (
      <img
        src={product.images[0]}
        alt={product.title}
        className="w-full h-40 object-cover rounded-xl border border-border/60"
      />
    )}
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{product.marketplace}</p>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">estimasi</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${product.available ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
          {product.available ? "stok tersedia" : "sold out"}
        </span>
      </div>
      <p className="font-semibold text-sm line-clamp-2">{product.title || "Produk ditemukan"}</p>
      <p className="text-sm mt-1">
        Harga: <span className="font-bold text-primary">{product.price_display || "Tidak ditemukan"}</span>
      </p>
      {product.condition && <p className="text-xs text-muted-foreground">Kondisi: {product.condition}</p>}
      {product.price_jpy && (
        <div className="text-xs mt-2 space-y-1 border-t border-border/60 pt-2">
          {(() => {
            const fees = estimateAllInFromJPY(product.price_jpy);
            return (
              <>
                <div className="flex justify-between"><span>Harga (Rp)</span><span>Rp {fees.basePrice.toLocaleString("id-ID")}</span></div>
                <div className="flex justify-between"><span>Fee jasa</span><span>Rp {fees.serviceFee.toLocaleString("id-ID")}</span></div>
                <div className="flex justify-between"><span>Ongkir</span><span>Rp {fees.shipping.toLocaleString("id-ID")}</span></div>
                <div className="flex justify-between"><span>Pajak</span><span>Rp {fees.tax.toLocaleString("id-ID")}</span></div>
                <div className="flex justify-between font-bold text-primary"><span>Total estimasi</span><span>Rp {fees.total.toLocaleString("id-ID")}</span></div>
              </>
            );
          })()}
        </div>
      )}
      {product.scraped_at && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Last checked: {new Date(product.scraped_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
    <div className="grid grid-cols-2 gap-2 pt-1">
      <a
        href={product.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center rounded-lg border border-border px-2 py-2 text-xs font-medium hover:bg-muted"
      >
        Lihat detail lengkap
      </a>
      <button
        type="button"
        onClick={() => onAskCheaper(product)}
        className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-2 py-2 text-xs font-medium hover:opacity-90"
      >
        Minta alternatif lebih murah
      </button>
    </div>
  </div>
);

const ComparisonCard = ({
  comparisons,
  onPick,
  onCompareAgain,
}: {
  comparisons: ComparisonItem[];
  onPick: (item: ComparisonItem) => void;
  onCompareAgain: () => void;
}) => (
  <div className="rounded-2xl bg-background border border-border p-3 mt-2 shadow-soft">
    <p className="text-sm font-semibold mb-2">Perbandingan 3 opsi termurah</p>
    <div className="space-y-2">
      {comparisons.map((item, idx) => (
        <div key={`${item.marketplace}-${idx}`} className="rounded-lg border border-border p-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Marketplace</span><span className="font-medium">{item.marketplace}</span>
            <span className="text-muted-foreground">Harga</span><span className="font-medium">{item.price_display}</span>
            <span className="text-muted-foreground">Kondisi</span><span className="font-medium">{item.condition}</span>
            <span className="text-muted-foreground">Estimasi total</span><span className="font-semibold text-primary">Rp {item.total_estimated_idr.toLocaleString("id-ID")}</span>
          </div>
          <button
            type="button"
            onClick={() => onPick(item)}
            className="mt-2 w-full rounded-md bg-primary text-primary-foreground py-1 font-medium"
          >
            Pilih ini
          </button>
        </div>
      ))}
    </div>
    <button
      type="button"
      onClick={onCompareAgain}
      className="mt-2 w-full rounded-md border border-border py-1 text-xs font-medium hover:bg-muted"
    >
      Bandingkan lagi
    </button>
  </div>
);

const WhatsAppDemo = () => {
  const [msgs, setMsgs] = useState<Msg[]>(initialMsgs);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [funnelState, setFunnelState] = useState<FunnelState>("discovering");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  const now = () => new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  const send = async (text: string) => {
    if (!text.trim() || typing) return;

    const trimmedText = text.trim();
    if (/checkout|bayar|invoice|pembayaran/i.test(trimmedText)) {
      setFunnelState("payment");
    } else if (/tracking|dikirim|sampai/i.test(trimmedText)) {
      setFunnelState("post-payment");
    }
    const userMsg: Msg = { id: Date.now(), from: "user", text: trimmedText, time: now() };
    setMsgs((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);

    const updatedHistory: ChatMessage[] = [...history, { role: "user", content: trimmedText }];
    setHistory(updatedHistory);

    try {
      if (URL_REGEX.test(trimmedText)) {
        setFunnelState("discovering");
        const steps = [
          "🔎 Normalisasi link...",
          "🕸️ Mengambil detail produk...",
          "🧮 Menyusun estimasi biaya...",
        ];
        for (const [idx, step] of steps.entries()) {
          setMsgs((m) => [...m, {
            id: Date.now() + idx + 1,
            from: "bot",
            text: idx === 0 ? `${createSearchAcknowledgement()}\n${step}` : step,
            time: now(),
          }]);
          await wait(600);
        }
      }

      const { text: reply, scrapedProduct } = await sendMessage(updatedHistory, API_KEY);
      await wait(700);

      if (scrapedProduct) {
        setFunnelState("comparing");
        setMsgs((m) => [...m, {
          id: Date.now() + 2,
          from: "bot",
          card: "product",
          product: scrapedProduct,
          time: now(),
        }]);

        const basePrice = scrapedProduct.price_jpy ?? Math.round((scrapedProduct.price_display.match(/\d[\d,]*/) ? Number((scrapedProduct.price_display.match(/\d[\d,]*/) as RegExpMatchArray)[0].replace(/,/g, "")) : 10000));
        const comparisons: ComparisonItem[] = [
          { title: scrapedProduct.title, marketplace: "Mercari", condition: scrapedProduct.condition ?? "used", price_jpy: Math.max(1000, Math.round(basePrice * 0.9)), price_display: `¥${Math.max(1000, Math.round(basePrice * 0.9)).toLocaleString("ja-JP")}`, total_estimated_idr: estimateAllInFromJPY(Math.max(1000, Math.round(basePrice * 0.9))).total },
          { title: scrapedProduct.title, marketplace: "Rakuten", condition: "new", price_jpy: Math.max(1000, Math.round(basePrice * 0.84)), price_display: `¥${Math.max(1000, Math.round(basePrice * 0.84)).toLocaleString("ja-JP")}`, total_estimated_idr: estimateAllInFromJPY(Math.max(1000, Math.round(basePrice * 0.84))).total },
          { title: scrapedProduct.title, marketplace: "Yahoo Auction", condition: "used", price_jpy: Math.max(1000, Math.round(basePrice * 0.78)), price_display: `¥${Math.max(1000, Math.round(basePrice * 0.78)).toLocaleString("ja-JP")}`, total_estimated_idr: estimateAllInFromJPY(Math.max(1000, Math.round(basePrice * 0.78))).total },
        ];
        setMsgs((m) => [...m, {
          id: Date.now() + 3,
          from: "bot",
          card: "comparison",
          comparisons,
          time: now(),
        }]);
      }

      setMsgs((m) => [...m, {
        id: Date.now() + 4,
        from: "bot",
        text: reply,
        time: now(),
      }]);

      setHistory((h) => [...h, { role: "assistant", content: reply }]);
    } catch (err) {
      setMsgs((m) => [...m, {
        id: Date.now() + 3,
        from: "bot",
        text: "Maaf, ada gangguan koneksi. Coba lagi ya! 🙏",
        time: now(),
      }]);
    } finally {
      setTyping(false);
    }
  };

  const askCheaperAlternative = (product: ProductData) => {
    setFunnelState("comparing");
    const prompt = `Tolong carikan alternatif lebih murah dari produk ini: ${product.title}. Link referensi: ${product.url}. Prioritaskan yang ready stock di marketplace Jepang.`;
    void send(prompt);
  };

  const pickComparedItem = (item: ComparisonItem) => {
    setFunnelState("confirming");
    void send(`Saya pilih opsi ${item.marketplace} dengan harga ${item.price_display}. Tolong lanjutkan ke tahap konfirmasi checkout.`);
  };

  const compareAgain = () => {
    setFunnelState("comparing");
    void send("Bandingkan lagi 3 opsi termurah dengan kondisi terbaik dan sertakan estimasi total.");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-10 md:py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs uppercase tracking-widest text-success font-semibold">Demo</span>
          <h1 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4">
            Begini rasanya belanja via WhatsApp.
          </h1>
          <p className="text-muted-foreground">Coba klik salah satu pesan cepat di bawah dan lihat alurnya end-to-end.</p>
        </div>

        <div className="max-w-md mx-auto">
          {/* Phone frame */}
          <div className="rounded-[2.5rem] bg-foreground p-2.5 shadow-card">
            <div className="rounded-[2rem] overflow-hidden bg-[#e5ddd5] flex flex-col h-[640px]">
              {/* WA header */}
              <div className="bg-success px-4 py-3 flex items-center gap-3 text-success-foreground">
                <div className="h-10 w-10 rounded-full bg-background/20 grid place-items-center font-display font-bold">M</div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">MyBagasi AI</p>
                  <p className="text-[11px] opacity-90">{typing ? "mengetik..." : `online • ${funnelState}`}</p>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      m.from === "user" ? "bg-[#dcf8c6] text-foreground rounded-br-sm" : "bg-background text-foreground rounded-bl-sm"
                    }`}>
                      {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
                      {m.card === "quotation" && <QuotationCard />}
                      {m.card === "payment" && <PaymentCard />}
                      {m.card === "tracking" && <TrackingCard />}
                      {m.card === "product" && m.product && (
                        <ProductCard
                          product={m.product}
                          onAskCheaper={askCheaperAlternative}
                        />
                      )}
                      {m.card === "comparison" && m.comparisons && (
                        <ComparisonCard
                          comparisons={m.comparisons}
                          onPick={pickComparedItem}
                          onCompareAgain={compareAgain}
                        />
                      )}
                      <div className="flex justify-end items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                        {m.time}
                        {m.from === "user" && <CheckCheck className="h-3 w-3 text-accent" />}
                      </div>
                    </div>
                  </div>
                ))}
                {typing && (
                  <div className="flex">
                    <div className="bg-background rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                      <div className="flex gap-1">
                        {[0, 150, 300].map((d) => (
                          <span key={d} className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-pulse-soft" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick replies */}
              <div className="px-3 py-2 flex gap-2 overflow-x-auto bg-[#e5ddd5]">
                {quickReplies.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    disabled={typing}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-background/90 border border-border/40 hover:bg-background disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="p-2 bg-[#f0f0f0] flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  placeholder="Ketik pesan..."
                  disabled={typing}
                  className="flex-1 rounded-full bg-background px-4 py-2.5 text-sm outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => send(input)}
                  disabled={typing || !input.trim()}
                  className="h-10 w-10 rounded-full bg-success grid place-items-center text-success-foreground shadow-soft disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default WhatsAppDemo;
