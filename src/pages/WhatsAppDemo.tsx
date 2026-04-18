import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Send, Check, CheckCheck, Package, CreditCard, Plane, Home, Sparkles } from "lucide-react";

type Msg = {
  id: number;
  from: "user" | "bot";
  text?: string;
  card?: "quotation" | "payment" | "tracking";
  time: string;
};

const initialMsgs: Msg[] = [
  { id: 1, from: "bot", text: "Konnichiwa! 👋 Saya MyBagasi AI. Mau cari barang apa dari Jepang hari ini?", time: "10:00" },
];

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

const WhatsAppDemo = () => {
  const [msgs, setMsgs] = useState<Msg[]>(initialMsgs);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  const now = () => new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Msg = { id: Date.now(), from: "user", text, time: now() };
    setMsgs((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);

    setTimeout(() => {
      setMsgs((m) => [...m, {
        id: Date.now() + 1, from: "bot",
        text: "Oke! Saya scrape produknya dulu... 🔍",
        time: now(),
      }]);
    }, 800);

    setTimeout(() => {
      setMsgs((m) => [...m, {
        id: Date.now() + 2, from: "bot",
        text: "Ini quotation lengkapnya, sudah include semua biaya:",
        card: "quotation", time: now(),
      }]);
      setTyping(false);
    }, 2200);

    setTimeout(() => {
      setMsgs((m) => [...m, { id: Date.now() + 3, from: "bot", card: "payment", time: now() }]);
    }, 4500);

    setTimeout(() => {
      setMsgs((m) => [...m, { id: Date.now() + 4, from: "bot", card: "tracking", time: now() }]);
    }, 6000);
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
                  <p className="text-[11px] opacity-90">{typing ? "mengetik..." : "online"}</p>
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
                    className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-background/90 border border-border/40 hover:bg-background"
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
                  className="flex-1 rounded-full bg-background px-4 py-2.5 text-sm outline-none"
                />
                <button
                  onClick={() => send(input)}
                  className="h-10 w-10 rounded-full bg-success grid place-items-center text-success-foreground shadow-soft"
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
