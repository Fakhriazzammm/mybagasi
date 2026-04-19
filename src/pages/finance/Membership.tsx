import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { membershipRevenue, fmtRp } from "@/lib/finance-mock";
import { Crown, TrendingUp } from "lucide-react";

export default function MembershipRevenuePage() {
  const totalMrr = membershipRevenue.reduce((s, m) => s + m.mrr, 0);
  const totalSubs = membershipRevenue.reduce((s, m) => s + m.subscribers, 0);
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
      <div className="grid md:grid-cols-3 gap-4">
        {membershipRevenue.map((m) => (
          <Card key={m.tier} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  <span className="font-display text-lg font-bold">{m.tier}</span>
                </div>
                <Badge className="bg-success/15 text-success"><TrendingUp className="h-3 w-3 mr-1" />{m.growth}</Badge>
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
    </>
  );
}
