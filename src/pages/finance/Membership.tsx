import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useMembershipRevenue } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { Crown } from "lucide-react";

export default function MembershipRevenuePage() {
  const { data: revenueRows = [], isLoading, error } = useMembershipRevenue();

  const tiers = useMemo(() => {
    const map: Record<string, { tier: string; subscribers: number; mrr: number }> = {};
    for (const row of revenueRows as any[]) {
      const tier = row.tier;
      const price = row.membership_plans?.price_monthly ?? 0;
      if (!map[tier]) {
        map[tier] = { tier, subscribers: 0, mrr: 0 };
      }
      map[tier].subscribers += 1;
      map[tier].mrr += price;
    }
    return Object.values(map);
  }, [revenueRows]);

  const totalMrr = tiers.reduce((s, t) => s + t.mrr, 0);
  const totalSubs = tiers.reduce((s, t) => s + t.subscribers, 0);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 p-6">
        <div className="h-20 bg-secondary rounded-3xl" />
        <div className="h-20 bg-secondary rounded-3xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Gagal memuat</p>
        <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Finance" title="Membership Revenue" description="Recurring revenue dari subscriber Plus, Pro, dan Seller." />
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <Card className="border-border/60"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total MRR</p>
          <p className="font-display text-2xl font-bold mt-1">{fmtRp(totalMrr)}</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total subscribers</p>
          <p className="font-display text-2xl font-bold mt-1">{totalSubs.toLocaleString("id-ID")}</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Proyeksi ARR</p>
          <p className="font-display text-2xl font-bold mt-1 text-success">{fmtRp(totalMrr * 12)}</p>
        </CardContent></Card>
      </div>

      {tiers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Belum ada data</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {tiers.map((m) => (
            <Card key={m.tier} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-primary" />
                    <span className="font-display text-lg font-bold">{m.tier}</span>
                  </div>
                </div>
                <p className="font-display text-3xl font-bold mt-3">{fmtRp(m.mrr)}</p>
                <p className="text-xs text-muted-foreground mt-1">{m.subscribers.toLocaleString("id-ID")} subscribers</p>
                <div className="mt-4 pt-4 border-t border-border/40">
                  <p className="text-xs text-muted-foreground">ARPU bulanan</p>
                  <p className="font-semibold mt-0.5">{fmtRp(Math.round(m.mrr / m.subscribers))}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
