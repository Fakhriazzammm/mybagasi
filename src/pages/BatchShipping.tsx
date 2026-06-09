import { useEffect, useState } from "react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useBatchShipments, useJoinBatch } from "@/hooks";
import { fmtRp } from "@/lib/format";
import {
  Clock, MapPin, Users, Plane, Sparkles, Weight, ArrowRight,
  Calendar,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

// ─── Countdown ──────────────────────────────────────────────────────────────

function useCountdown(target: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return { d, h, m, s, ended: diff === 0 };
}

const Countdown = ({ to }: { to: string }) => {
  const { d, h, m, s, ended } = useCountdown(to);
  if (ended) return <span className="text-xs text-muted-foreground">Tutup</span>;
  return (
    <div className="flex gap-1 text-xs font-mono">
      {[{ v: d, l: "h" }, { v: h, l: "j" }, { v: m, l: "m" }, { v: s, l: "d" }].map((x, i) => (
        <span key={i} className="bg-foreground/80 text-background rounded-lg px-1.5 py-1 font-bold tabular-nums text-[11px]">
          {String(x.v).padStart(2, "0")}<span className="opacity-60 ml-0.5">{x.l}</span>
        </span>
      ))}
    </div>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const statusTone: Record<string, string> = {
  open: "bg-success/15 text-success",
  closing_soon: "bg-warning/15 text-warning",
  closed: "bg-muted text-muted-foreground",
  shipping: "bg-primary-soft text-primary",
};

const directionLabel: Record<string, string> = {
  indonesia_to_japan: "🇮🇩 → 🇯🇵",
  japan_to_indonesia: "🇯🇵 → 🇮🇩",
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BatchShipping() {
  const { data: batches = [], isLoading, error } = useBatchShipments();
  const joinBatch = useJoinBatch();

  const jpToId = batches.filter((b: any) => b.direction === "japan_to_indonesia" || !b.direction);
  const idToJp = batches.filter((b: any) => b.direction === "indonesia_to_japan");

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto py-20">
          <div className="animate-pulse space-y-4 p-6">
            <div className="h-20 bg-secondary rounded-3xl" />
            <div className="h-20 bg-secondary rounded-3xl" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto py-20 text-center">
          <p className="text-destructive">Gagal memuat data</p>
          <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
        </div>
        <Footer />
      </div>
    );
  }

  const renderCard = (b: any) => {
    const joined = b.participants?.[0]?.count ?? 0;
    const fillPct = b.capacity > 0 ? Math.round((joined / b.capacity) * 100) : 0;
    const weightUsed = b.participants?.[0]?.total_weight ?? 0;
    const weightPct = b.max_weight_kg > 0 ? Math.round((weightUsed / b.max_weight_kg) * 100) : 0;

    return (
      <Card key={b.id} className="border-border/60 overflow-hidden hover:shadow-card transition-shadow">
        <CardContent className="p-0">
          <div className="p-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={statusTone[b.status] ?? "bg-muted text-muted-foreground"}>
                    {b.status === "open" ? "Buka" : b.status === "closing_soon" ? "Segera Tutup" : b.status === "closed" ? "Tutup" : "Dikirim"}
                  </Badge>
                  {b.direction && (
                    <span className="text-xs">{directionLabel[b.direction] ?? b.route}</span>
                  )}
                </div>
                <h3 className="font-display text-lg font-bold mt-2">{b.name}</h3>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end mb-1">
                  <Clock className="h-3 w-3" />Tutup
                </p>
                <Countdown to={b.closes_at} />
              </div>
            </div>

            {/* Schedule info */}
            <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Berangkat {new Date(b.departure_date || b.closes_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              {b.arrives_at && (
                <>
                  <ArrowRight className="h-3 w-3" />
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-accent" />
                    Tiba {new Date(b.arrives_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Orang</p>
                <p className="font-display text-lg font-bold mt-0.5">{joined}/{b.capacity}</p>
              </div>
              <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Berat</p>
                <p className="font-display text-lg font-bold mt-0.5">{b.max_weight_kg || "—"} kg</p>
              </div>
              <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Per kg</p>
                <p className="font-display text-lg font-bold mt-0.5">{fmtRp(b.price_per_kg)}</p>
              </div>
              <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Hemat</p>
                <p className="font-display text-lg font-bold mt-0.5 text-success">{b.savings_percent}%</p>
              </div>
            </div>

            {/* Progress bars */}
            <div className="space-y-2 mb-4">
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Kapasitas orang</span>
                  <span className="font-semibold">{fillPct}%</span>
                </div>
                <Progress value={fillPct} className="h-1.5" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Kapasitas berat</span>
                  <span className="font-semibold">{weightPct}%</span>
                </div>
                <Progress value={weightPct} className="h-1.5" />
              </div>
            </div>

            {/* Join button */}
            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <div className="text-xs text-muted-foreground">
                <Users className="h-3 w-3 inline mr-1" />
                {joined} peserta
              </div>
              <Button
                variant={b.status === "open" || b.status === "closing_soon" ? "hero" : "outline"}
                size="sm"
                disabled={b.status === "closed" || b.status === "shipping" || joinBatch.isPending}
                onClick={() => {
                  joinBatch.mutate(
                    { batch_id: b.id, items: 1, weight_kg: 1 },
                    {
                      onSuccess: () => toast.success("Berhasil join!"),
                      onError: (e) => toast.error("Gagal", { description: (e as Error).message }),
                    }
                  );
                }}
                className="gap-1.5"
              >
                <Plane className="h-3.5 w-3.5" />
                {b.status === "shipping" ? "Dikirim" : b.status === "closed" ? "Tutup" : "Gabung"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSection = (title: string, icon: any, items: any[], empty: string) => (
    <div>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-9 w-9 rounded-xl bg-primary-soft text-primary grid place-items-center">
          {icon}
        </div>
        <div>
          <h2 className="font-display font-bold text-lg">{title}</h2>
          <p className="text-xs text-muted-foreground">{items.length} jadwal tersedia</p>
        </div>
      </div>
      <div className="space-y-4">
        {items.length === 0 ? (
          <Card className="border-dashed border-border/60">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {empty}
            </CardContent>
          </Card>
        ) : (
          items.map(renderCard)
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <section className="bg-gradient-hero border-b border-border/60">
        <div className="container mx-auto py-10 md:py-14">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-primary bg-primary-soft px-3 py-1 rounded-full mb-4">
              <Calendar className="h-3 w-3" /> Jadwal Pengiriman
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
              Kirim & terima barang dari <span className="text-primary">Indonesia ↔ Jepang</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-xl text-sm">
              Pilih jadwal keberangkatan. Patungan ongkir — makin banyak peserta, makin murah per kg.
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto py-8 md:py-12 flex-1">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Japan → Indonesia */}
          {renderSection(
            "Jepang → Indonesia",
            <Plane className="h-4 w-4" />,
            jpToId,
            "Belum ada jadwal dari Jepang ke Indonesia"
          )}

          {/* Indonesia → Japan */}
          {renderSection(
            "Indonesia → Jepang",
            <Plane className="h-4 w-4 scale-x-[-1]" />,
            idToJp,
            "Belum ada jadwal dari Indonesia ke Jepang"
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
