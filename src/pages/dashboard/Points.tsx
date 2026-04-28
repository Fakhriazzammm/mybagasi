import { Coins, Plus, Minus, ArrowRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { usePoints, usePointsLedger } from "@/hooks";
import { fmtRp } from "@/lib/format";

const Points = () => {
  const { data: balance, isLoading: balLoading, error: balError } = usePoints();
  const { data: ledger = [], isLoading: ledLoading, error: ledError } = usePointsLedger();

  const isLoading = balLoading || ledLoading;
  const error = balError || ledError;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Gagal memuat data</p>
        <p className="text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  const rupiahValue = balance != null ? balance * 10 : 0;

  return (
    <>
      <PageHeader eyebrow="Poin" title="Saldo & riwayat poin" description="1 poin = Rp 10. Tukar saat checkout untuk diskon." />

      <div className="grid md:grid-cols-3 gap-5 mb-6">
        <div className="md:col-span-2 rounded-3xl bg-gradient-coral text-primary-foreground p-8 shadow-glow relative overflow-hidden">
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_80%_30%,white,transparent_50%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
              <Coins className="h-4 w-4" /> Saldo Poin
            </div>
            <p className="font-display text-5xl md:text-6xl font-bold mt-3">{balance != null ? balance.toLocaleString("id-ID") : "0"}</p>
            <p className="text-sm opacity-90 mt-2">Senilai {fmtRp(rupiahValue)}</p>
            <Button size="sm" className="bg-background text-foreground hover:bg-background/90 mt-5">
              Tukar Poin <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
          <h3 className="font-display font-bold mb-3">Cara dapat poin</h3>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li>✨ Setiap order selesai (1% nilai order)</li>
            <li>🎁 Bonus signup 1.000 pts</li>
            <li>👥 Referral teman 500 pts</li>
            <li>📅 Login harian (7 hari) 100 pts</li>
          </ul>
        </div>
      </div>

      <div className="rounded-3xl bg-card border border-border/40 shadow-soft overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="font-display font-bold">Riwayat poin</h2>
        </div>
        <div className="divide-y divide-border/40">
          {ledger.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              Belum ada riwayat poin.
            </div>
          ) : (
            ledger.map((l) => (
              <div key={l.id} className="flex items-center gap-4 px-6 py-4">
                <div className={`h-10 w-10 rounded-2xl grid place-items-center shrink-0 ${l.type === "earn" ? "bg-success/15 text-success" : l.type === "redeem" ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"}`}>
                  {l.type === "earn" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{l.reference ?? l.type}</p>
                  <p className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <p className={`font-bold ${l.amount > 0 ? "text-success" : "text-primary"}`}>
                  {l.amount > 0 ? "+" : ""}{l.amount.toLocaleString("id-ID")} pts
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default Points;
