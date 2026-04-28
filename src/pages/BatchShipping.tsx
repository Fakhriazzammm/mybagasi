import { useEffect, useState } from "react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useBatchShipments, useJoinBatch } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { Clock, MapPin, Users, Plane, Package, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const statusTone: Record<string, string> = {
  open: "bg-success/15 text-success",
  closing_soon: "bg-warning/15 text-warning",
  closed: "bg-muted text-muted-foreground",
  shipping: "bg-primary-soft text-primary",
};

const statusLabel: Record<string, string> = {
  open: "Open",
  closing_soon: "Closing soon",
  closed: "Closed",
  shipping: "On the way",
};

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
  if (ended) return <span className="text-xs text-muted-foreground">Closed</span>;
  return (
    <div className="flex gap-1.5 text-xs font-mono">
      {[{ v: d, l: "d" }, { v: h, l: "j" }, { v: m, l: "m" }, { v: s, l: "s" }].map((x, i) => (
        <span key={i} className="bg-foreground text-background rounded-lg px-2 py-1 font-bold tabular-nums">
          {String(x.v).padStart(2, "0")}<span className="opacity-60 ml-0.5">{x.l}</span>
        </span>
      ))}
    </div>
  );
};

export default function BatchShipping() {
  const { data: batches = [], isLoading, error } = useBatchShipments();
  const joinBatch = useJoinBatch();

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
          <p className="text-destructive">Gagal memuat</p>
          <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <section className="bg-gradient-hero border-b border-border/60">
        <div className="container mx-auto py-12 md:py-16">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-primary bg-primary-soft px-3 py-1 rounded-full">
              <Plane className="h-3 w-3" /> Batch Shipping
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold mt-4 leading-tight">
              Patungan ongkir, hemat sampai <span className="text-primary">48%</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-xl">
              Gabung batch pengiriman bareng pengguna lain. Makin banyak yang join, makin murah ongkir per kg.
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto py-10 md:py-14 flex-1">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid gap-5">
            {batches.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Belum ada batch tersedia</p>
              </div>
            ) : (
              batches.map((b: any) => {
                const joined = b.participants?.[0]?.count ?? 0;
                const fillPct = b.capacity > 0 ? Math.round((joined / b.capacity) * 100) : 0;
                return (
                  <Card key={b.id} className="border-border/60 overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-5 md:p-6">
                        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={statusTone[b.status] ?? "bg-muted text-muted-foreground"}>{statusLabel[b.status] ?? b.status}</Badge>
                              <span className="font-mono text-[11px] text-muted-foreground">{b.id.slice(0, 8)}…</span>
                            </div>
                            <h3 className="font-display text-xl font-bold mt-2">{b.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                              <MapPin className="h-3 w-3" />{b.route} · sampai {b.arrives_at ? new Date(b.arrives_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end"><Clock className="h-3 w-3" />Tutup dalam</p>
                            <div className="mt-1.5"><Countdown to={b.closes_at} /></div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 my-4">
                          <div className="bg-secondary/60 rounded-2xl p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hemat ongkir</p>
                            <p className="font-display text-xl font-bold text-success mt-1">{b.savings_percent}%</p>
                          </div>
                          <div className="bg-secondary/60 rounded-2xl p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Per kg</p>
                            <p className="font-display text-xl font-bold mt-1">{fmtRp(b.price_per_kg)}</p>
                          </div>
                          <div className="bg-secondary/60 rounded-2xl p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Peserta</p>
                            <p className="font-display text-xl font-bold mt-1">{joined}/{b.capacity}</p>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">Kapasitas terisi</span>
                            <span className="font-semibold">{fillPct}%</span>
                          </div>
                          <Progress value={fillPct} className="h-2" />
                        </div>

                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/40">
                          <div className="text-xs text-muted-foreground">
                            {joined} peserta terdaftar
                          </div>
                          <Button
                            variant={b.status === "shipping" || b.status === "closed" ? "outline" : "hero"}
                            size="sm"
                            disabled={b.status === "shipping" || b.status === "closed" || joinBatch.isPending}
                            onClick={() => {
                              joinBatch.mutate(
                                { batch_id: b.id, items: 1, weight_kg: 1 },
                                {
                                  onSuccess: () => toast.success("Berhasil join batch!"),
                                  onError: (e) => toast.error("Gagal join", { description: (e as Error).message }),
                                }
                              );
                            }}
                          >
                            <Package className="h-4 w-4" />
                            {b.status === "shipping" ? "Sedang dikirim" : b.status === "closed" ? "Closed" : "Join batch"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <div className="space-y-5">
            <Card className="border-border/60 bg-gradient-hero">
              <CardContent className="p-5">
                <div className="h-10 w-10 rounded-2xl bg-primary text-primary-foreground grid place-items-center mb-3">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-bold">Cara kerja Batch Shipping</h3>
                <ol className="mt-3 space-y-2.5 text-sm">
                  {[
                    "Pilih batch dengan rute & jadwal cocok",
                    "Order kamu masuk ke gudang Tokyo / Osaka",
                    "Saat batch closing, semua paket dikirim bareng",
                    "Hemat ongkir karena biaya cargo dibagi",
                  ].map((s, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground grid place-items-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardContent className="p-5">
                <h3 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Batch tersedia</h3>
                <div className="mt-3 space-y-2.5 text-sm">
                  {batches.length === 0 ? (
                    <p className="text-muted-foreground">Belum ada batch</p>
                  ) : (
                    batches.map((b: any) => (
                      <div key={b.id} className="flex items-center gap-3">
                        <span className="font-medium flex-1">{b.name}</span>
                        <span className="text-xs text-muted-foreground">{b.route}</span>
                      </div>
                    ))
                  )}
                </div>
                <Button variant="ghost" size="sm" asChild className="w-full mt-3">
                  <Link to="/preorder">Lihat juga Pre-order →</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
