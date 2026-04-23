import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Send,
  RotateCcw,
  CreditCard,
  ExternalLink,
  ShoppingCart,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { sendMessage, extractUrl, type ChatMessage } from "@/lib/ai";

const API_KEY = import.meta.env.VITE_SUMOPOD_API_KEY as string;

type Msg = {
  id: number;
  role: "user" | "assistant";
  content: string;
  time: string;
  paymentUrl?: string;
};

const SUGGESTIONS = [
  "Rekomendasiin sepatu running brand Jepang budget Rp 1 juta",
  "Berapa estimasi harga kamera film Fujifilm termasuk ongkir?",
  "Cariin skincare Hada Labo Gokujyun di Rakuten",
  "Pre-order figurine One Piece dari Amazon JP bisa?",
];

const now = () =>
  new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

const AIShopper = () => {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasApiKey = Boolean(API_KEY?.trim());

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    if (!hasApiKey) {
      setMsgs((m) => [
        ...m,
        {
          id: Date.now(),
          role: "assistant",
          content:
            "Konfigurasi AI belum lengkap. Isi VITE_SUMOPOD_API_KEY di file .env lalu restart aplikasi.",
          time: now(),
        },
      ]);
      return;
    }

    const userMsg: Msg = { id: Date.now(), role: "user", content: text, time: now() };
    setMsgs((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    const updatedHistory: ChatMessage[] = [...history, { role: "user", content: text }];
    setHistory(updatedHistory);

    try {
      const reply = await sendMessage(updatedHistory, API_KEY);
      const paymentUrl = extractUrl(reply.text) ?? undefined;

      setMsgs((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: reply.text,
          time: now(),
          paymentUrl,
        },
      ]);
      setHistory((h) => [...h, { role: "assistant", content: reply.text }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi error tak dikenal.";
      setMsgs((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: `AI error: ${message}`,
          time: now(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const reset = () => {
    setMsgs([]);
    setHistory([]);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <>
      <PageHeader
        eyebrow="AI Personal Shopper"
        title="Bingung pilih? Tanya AI."
        description="Cari produk Jepang berdasarkan budget, brand, ukuran, atau cuma deskripsi acak. AI langsung buatkan invoice pembayaran."
      />

      <div
        className="flex flex-col rounded-3xl border border-border/40 shadow-soft overflow-hidden"
        style={{ height: "calc(100vh - 260px)", minHeight: 480 }}
      >
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-warm"
        >
          {msgs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary text-primary-foreground grid place-items-center animate-float">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <p className="font-display text-lg font-bold mb-1">
                  MyBagasi AI siap membantu
                </p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Tanya apapun tentang produk Jepang - harga, rekomendasi, estimasi biaya all-in,
                  bahkan bisa langsung bayar lewat AI.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs px-4 py-3 rounded-xl border border-border/60 bg-background/80 hover:bg-background hover:border-primary/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Link
                to="/checkout"
                className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                Langsung ke halaman checkout
              </Link>
            </div>
          )}

          {msgs.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" && (
                <div className="h-8 w-8 shrink-0 rounded-xl bg-primary text-primary-foreground grid place-items-center mt-0.5">
                  <Sparkles className="h-4 w-4" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-background text-foreground rounded-bl-sm border border-border/40"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>

                {m.paymentUrl && (
                  <a
                    href={m.paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <CreditCard className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Bayar Sekarang</span>
                    <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                  </a>
                )}

                <p
                  className={`text-[10px] mt-1.5 ${
                    m.role === "user"
                      ? "text-primary-foreground/60 text-right"
                      : "text-muted-foreground"
                  }`}
                >
                  {m.time}
                </p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="h-8 w-8 shrink-0 rounded-xl bg-primary text-primary-foreground grid place-items-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="bg-background rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-border/40">
                <div className="flex gap-1 items-center h-4">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-pulse-soft"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border/40 bg-background px-4 py-3 flex items-center gap-3">
          {msgs.length > 0 && (
            <button
              onClick={reset}
              title="Reset percakapan"
              className="h-10 w-10 rounded-xl border border-border/60 grid place-items-center text-muted-foreground hover:text-foreground hover:border-border transition-colors shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
            placeholder="Tanya tentang produk Jepang atau paste link produk..."
            disabled={loading || !hasApiKey}
            className="flex-1 rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 text-sm outline-none focus:border-primary/50 focus:bg-background transition-colors disabled:opacity-50"
          />
          <Button
            onClick={() => send(input)}
            disabled={loading || !input.trim() || !hasApiKey}
            size="sm"
            variant="hero"
            className="h-10 px-4 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {!hasApiKey && (
          <div className="border-t border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning-foreground">
            VITE_SUMOPOD_API_KEY belum diatur. Tambahkan di `.env`, lalu restart aplikasi.
          </div>
        )}
      </div>
    </>
  );
};

export default AIShopper;
