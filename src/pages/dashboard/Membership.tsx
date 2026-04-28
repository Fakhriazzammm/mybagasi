import { Crown, Check, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { useUserMembership, useMembershipPlans } from "@/hooks";
import { fmtRp } from "@/lib/format";

const Membership = () => {
  const { data: membership, isLoading: membLoading, error: membError } = useUserMembership();
  const { data: plans = [], isLoading: plansLoading, error: plansError } = useMembershipPlans();

  const isLoading = membLoading || plansLoading;
  const error = membError || plansError;

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

  const progress = membership ? Math.round((membership.spent_amount / membership.target_amount) * 100) : 0;
  const nextTier = membership
    ? (membership.tier === "Free" ? "Plus" : membership.tier === "Plus" ? "Pro" : "Seller")
    : "Plus";

  return (
    <>
      <PageHeader eyebrow="Membership" title="Status & benefit kamu" />

      <div className="rounded-3xl bg-gradient-coral text-primary-foreground p-8 shadow-glow relative overflow-hidden mb-6">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_70%_20%,white,transparent_50%)]" />
        <div className="relative grid md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
              <Crown className="h-4 w-4" /> Tier aktif
            </div>
            <p className="font-display text-5xl font-bold mt-2">{membership?.tier ?? "Free"}</p>
            <p className="text-sm opacity-80 mt-2">
              {membership?.renews_on
                ? `Berlaku sampai ${new Date(membership.renews_on).toLocaleDateString("id-ID")}`
                : "Aktif selamanya"}
            </p>
          </div>
          <div>
            {membership ? (
              <>
                <div className="flex justify-between text-xs opacity-90 mb-2">
                  <span>Menuju {nextTier}</span>
                  <span>{Math.min(progress, 100)}%</span>
                </div>
                <div className="h-3 rounded-full bg-background/25 overflow-hidden">
                  <div className="h-full bg-background rounded-full" style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs opacity-90 mt-2">
                  <span>{fmtRp(membership.spent_amount)}</span>
                  <span>{fmtRp(membership.target_amount)}</span>
                </div>
                <p className="text-xs opacity-80 mt-2">
                  Belanja {fmtRp(membership.target_amount - membership.spent_amount)} lagi untuk upgrade gratis ke {nextTier}.
                </p>
              </>
            ) : (
              <p className="text-sm opacity-80">Mulai belanja untuk unlock tier berikutnya.</p>
            )}
          </div>
        </div>
      </div>

      <h2 className="font-display text-lg font-bold mb-4">Pilih paket</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {plans.length === 0 ? (
          <div className="md:col-span-3 rounded-3xl bg-card border border-border/40 p-12 text-center text-muted-foreground">
            Belum ada paket membership.
          </div>
        ) : (
          plans.map((t) => {
            const current = membership?.tier === t.name;
            return (
              <div key={t.id} className={`rounded-3xl p-6 border ${current ? "bg-card border-primary shadow-card" : "bg-card border-border/40 shadow-soft"}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-display text-2xl font-bold">{t.name}</p>
                  {current && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold">AKTIF</span>}
                </div>
                <p className="text-sm text-muted-foreground mb-5">{t.price_monthly ? fmtRp(t.price_monthly) + "/bulan" : "Rp 0"}</p>
                <ul className="space-y-2 mb-6 text-sm">
                  {(t.features ?? []).map((f: string) => (
                    <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-success shrink-0 mt-0.5" /><span>{f}</span></li>
                  ))}
                </ul>
                <Button variant={current ? "outline" : "hero"} className="w-full" disabled={current}>
                  {current ? "Paket Sekarang" : `Upgrade ke ${t.name}`}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
};

export default Membership;
