import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { preorders, fmtRp, fmtJpy } from "@/lib/admin-mock";
import { Calendar, Clock, Sparkles, ShieldCheck, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const tagTone: Record<string, string> = {
  Hot: "bg-destructive/15 text-destructive",
  Limited: "bg-warning/15 text-warning",
  "Closing soon": "bg-warning/15 text-warning",
  New: "bg-success/15 text-success",
  "Pre-launch": "bg-accent/15 text-accent",
  Seasonal: "bg-primary-soft text-primary",
};

function useCountdown(target: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  return { d, h, ended: diff === 0 };
}

const PreorderCard = ({ po, onBook }: { po: typeof preorders[number]; onBook: () => void }) => {
  const { d, h, ended } = useCountdown(po.closesAt);
  const fill = Math.round((po.quotaTaken / po.quotaTotal) * 100);
  const left = po.quotaTotal - po.quotaTaken;

  return (
    <Card className="border-border/60 overflow-hidden hover:shadow-soft transition-shadow group">
      <CardContent className="p-0">
        <div className="aspect-[5/3] bg-gradient-hero grid place-items-center text-7xl relative">
          <span className="group-hover:scale-110 transition-transform">{po.emoji}</span>
          <Badge className={`absolute top-3 left-3 ${tagTone[po.tag] || "bg-secondary"}`}>{po.tag}</Badge>
          {left <= 5 && <Badge className="absolute top-3 right-3 bg-destructive/15 text-destructive">Sisa {left}</Badge>}
        </div>
        <div className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{po.brand}</p>
          <h3 className="font-display text-lg font-bold mt-1 leading-tight line-clamp-2">{po.name}</h3>

          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Rilis {po.releaseDate}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />
              {ended ? "Closed" : `${d}h ${h}j`}
            </span>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">Kuota terisi</span>
              <span className="font-semibold">{po.quotaTaken}/{po.quotaTotal}</span>
            </div>
            <Progress value={fill} className="h-1.5" />
          </div>

          <div className="flex items-end justify-between mt-4 pt-3 border-t border-border/40">
            <div>
              <p className="text-[11px] text-muted-foreground">Estimasi all-in</p>
              <p className="font-display text-lg font-bold text-primary">{fmtRp(po.estimateIdr)}</p>
              <p className="text-[10px] text-muted-foreground">retail {fmtJpy(po.retailJpy)}</p>
            </div>
            <Button variant="hero" size="sm" onClick={onBook} disabled={ended || left === 0}>
              Booking <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function Preorder() {
  const [selected, setSelected] = useState<typeof preorders[number] | null>(null);
  const [paymentType, setPaymentType] = useState<"dp" | "full">("dp");

  const totals = useMemo(() => {
    if (!selected) return null;
    const due = paymentType === "dp" ? selected.dpIdr : selected.estimateIdr;
    const remaining = paymentType === "dp" ? selected.estimateIdr - selected.dpIdr : 0;
    return { due, remaining };
  }, [selected, paymentType]);

  const handleConfirm = () => {
    if (!selected) return;
    toast.success(`Booking ${selected.name} terkonfirmasi!`, {
      description: `Bayar ${paymentType === "dp" ? "DP" : "lunas"} sebesar ${fmtRp(totals!.due)} via WhatsApp.`,
    });
    setSelected(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <section className="bg-gradient-hero border-b border-border/60">
        <div className="container mx-auto py-12 md:py-16">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-primary bg-primary-soft px-3 py-1 rounded-full">
              <Sparkles className="h-3 w-3" /> Pre-order
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold mt-4 leading-tight">
              Booking produk Jepang <span className="text-primary">sebelum dirilis</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-xl">
              Amankan limited edition, exclusive Japan release, dan produk langka. Bayar DP atau lunas — kami yang antri di Jepang.
            </p>
            <div className="flex flex-wrap gap-3 mt-5 text-sm">
              <span className="flex items-center gap-1.5 bg-background/60 backdrop-blur rounded-full px-3 py-1.5 border border-border/60">
                <ShieldCheck className="h-4 w-4 text-success" /> Refund 100% jika gagal
              </span>
              <span className="flex items-center gap-1.5 bg-background/60 backdrop-blur rounded-full px-3 py-1.5 border border-border/60">
                <Sparkles className="h-4 w-4 text-primary" /> Prioritas di hari rilis
              </span>
            </div>
          </div>
        </div>
      </section>

      <main className="container mx-auto py-10 md:py-14 flex-1">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {preorders.map((po) => (
            <PreorderCard key={po.id} po={po} onBook={() => { setSelected(po); setPaymentType("dp"); }} />
          ))}
        </div>
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Booking pre-order</DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-3 p-3 bg-secondary/60 rounded-2xl">
                <div className="h-14 w-14 rounded-xl bg-background grid place-items-center text-3xl">{selected.emoji}</div>
                <div className="min-w-0">
                  <p className="font-semibold leading-tight line-clamp-2">{selected.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Rilis {selected.releaseDate}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Pilih opsi pembayaran</p>
                <RadioGroup value={paymentType} onValueChange={(v: any) => setPaymentType(v)} className="grid gap-2">
                  <Label className={`flex items-start gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-colors ${paymentType === "dp" ? "border-primary bg-primary-soft/40" : "border-border"}`}>
                    <RadioGroupItem value="dp" className="mt-0.5" />
                    <div className="flex-1">
                      <div className="flex justify-between font-semibold text-sm">
                        <span>Bayar DP</span>
                        <span className="text-primary">{fmtRp(selected.dpIdr)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Sisa {fmtRp(selected.estimateIdr - selected.dpIdr)} dibayar saat barang siap kirim.</p>
                    </div>
                  </Label>
                  <Label className={`flex items-start gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-colors ${paymentType === "full" ? "border-primary bg-primary-soft/40" : "border-border"}`}>
                    <RadioGroupItem value="full" className="mt-0.5" />
                    <div className="flex-1">
                      <div className="flex justify-between font-semibold text-sm">
                        <span>Bayar lunas</span>
                        <span className="text-primary">{fmtRp(selected.estimateIdr)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Dapat prioritas pengiriman & bonus 200 poin.</p>
                    </div>
                  </Label>
                </RadioGroup>
              </div>

              <div className="border-t border-border/40 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Yang dibayar sekarang</span><span className="font-semibold">{fmtRp(totals!.due)}</span></div>
                {totals!.remaining > 0 && (
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Sisa nanti</span><span>{fmtRp(totals!.remaining)}</span></div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setSelected(null)}>Batal</Button>
                <Button variant="hero" onClick={handleConfirm}>Konfirmasi booking</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
