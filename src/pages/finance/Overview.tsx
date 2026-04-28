import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { TrendingUp, Wallet, Clock, Undo2, Coins, Crown, Users, Download } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { paymentsService, refundsService } from "@/services/payments.service";
import { usePayments, useMembershipRevenue, usePointsLiability, useAffiliatePayouts } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

type StatProps = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  delta?: string;
  href?: string;
  tone?: "primary" | "warn" | "accent";
};

const Stat = ({ icon: Icon, label, value, delta, href, tone = "primary" }: StatProps) => (
  <Card className="border-border/60">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="font-display text-xl md:text-2xl font-bold mt-1 truncate">{value}</p>
          {delta && <p className="text-xs text-success font-semibold mt-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" />{delta}</p>}
        </div>
        <div className={`h-10 w-10 rounded-2xl grid place-items-center shrink-0 ${tone === "primary" ? "bg-primary-soft text-primary" : tone === "warn" ? "bg-warning/15 text-warning" : "bg-accent/15 text-accent"}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {href && <Link to={href} className="text-xs text-primary font-semibold mt-3 inline-block hover:underline">Lihat detail →</Link>}
    </CardContent>
  </Card>
);

export default function FinanceOverview() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ["finance-stats"],
    queryFn: paymentsService.getStats,
  });

  const { data: payments = [], isLoading: paymentsLoading, error: paymentsError } = usePayments();
  const { data: refunds = [], isLoading: refundsLoading, error: refundsError } = useQuery({
    queryKey: ["refunds", "all"],
    queryFn: () => refundsService.listAll(),
  });
  const { data: revenueRows = [], isLoading: revLoading, error: revError } = useMembershipRevenue();
  const { data: pointsLiability, isLoading: ptsLoading, error: ptsError } = usePointsLiability();
  const { data: payouts = [], isLoading: affLoading, error: affError } = useAffiliatePayouts();

  const isLoading = statsLoading || paymentsLoading || refundsLoading || revLoading || ptsLoading || affLoading;
  const error = statsError || paymentsError || refundsError || revError || ptsError || affError;

  const membershipMtd = useMemo(() => {
    let total = 0;
    for (const row of revenueRows as any[]) {
      total += row.membership_plans?.price_monthly ?? 0;
    }
    return total;
  }, [revenueRows]);

  const refundsQueue = useMemo(() => refunds.reduce((s: number, r: any) => s + r.amount, 0), [refunds]);
  const refundsCount = refunds.length;
  const affiliateOwed = useMemo(() => payouts.filter((a: any) => a.status === "pending").reduce((s: number, a: any) => s + a.commission, 0), [payouts]);


  const exportAll = () => {
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const sections: string[] = [];
    sections.push([
      ["metric", "value"],
      ["payments_today", stats?.paymentsToday ?? 0],
      ["pending_payment", stats?.pendingPayment ?? 0],
      ["refunds_queue", refundsQueue],
      ["membership_mtd", membershipMtd],
      ["affiliate_owed", affiliateOwed],
      ["points_liability", pointsLiability ?? 0],
      ["gmv_mtd", stats?.gmvMtd ?? 0],
    ].map((row) => row.map(escape).join(",")).join("\n"));
    sections.push("\npayments\n" + [["id", "customer", "method", "amount", "status", "created_at"], ...(payments as any[]).map((p) => [p.id, p.profiles?.name ?? p.user_id, p.method, p.amount, p.status, p.created_at])].map((row) => row.map(escape).join(",")).join("\n"));
    sections.push("\nrefunds\n" + [["id", "order_id", "amount", "status", "reason", "created_at"], ...(refunds as any[]).map((r) => [r.id, r.order_id, r.amount, r.status, r.reason, r.created_at])].map((row) => row.map(escape).join(",")).join("\n"));
    sections.push("\naffiliate_payouts\n" + [["id", "user", "commission", "status", "period", "created_at"], ...(payouts as any[]).map((a) => [a.id, a.profiles?.name ?? a.user_id, a.commission, a.status, a.period, a.created_at])].map((row) => row.map(escape).join(",")).join("\n"));
    const blob = new Blob([sections.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mybagasi-finance-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Laporan CSV diunduh dari data real-time");
  };

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
      <PageHeader
        eyebrow="Finance"
        title="Ringkasan Keuangan"
        description="Pantau cashflow MyBagasi: pembayaran masuk, pending, refund, dan revenue membership."
        action={
          <Button variant="hero" size="sm" onClick={exportAll}>
            <Download className="h-4 w-4" />Export semua
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Stat icon={Wallet} label="Payment hari ini" value={fmtRp(stats?.paymentsToday ?? 0)} href="/finance/payments" />
        <Stat icon={Clock} label={`Pending (${stats?.pendingCount ?? 0})`} value={fmtRp(stats?.pendingPayment ?? 0)} tone="warn" href="/finance/pending" />
        <Stat icon={Undo2} label={`Refund queue (${refundsCount})`} value={fmtRp(refundsQueue)} tone="warn" href="/finance/refunds" />
        <Stat icon={Crown} label="Membership MTD" value={fmtRp(membershipMtd)} tone="accent" href="/finance/membership" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Stat icon={Users} label="Affiliate utang" value={fmtRp(affiliateOwed)} tone="accent" href="/finance/affiliate" />
        <Stat icon={Coins} label="Liabilitas poin" value={fmtRp(pointsLiability ?? 0)} href="/finance/points" />
        <Stat icon={TrendingUp} label="GMV MTD" value={fmtRp(stats?.gmvMtd ?? 0)} />
        <Stat icon={Wallet} label="Net revenue MTD" value={fmtRp((stats?.gmvMtd ?? 0) * 0.08)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Pembayaran terbaru</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/finance/payments">Lihat semua</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {payments.length === 0 ? (
              <div className="text-center py-8"><p className="text-muted-foreground">Belum ada data</p></div>
            ) : (
              payments.slice(0, 5).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-3 text-sm border-b border-border/40 last:border-0 pb-2.5 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.profiles?.name ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{p.method} · {new Date(p.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">{fmtRp(p.amount)}</p>
                    <Badge className={p.status === "settled" ? "bg-success/15 text-success" : p.status === "pending" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"}>
                      {p.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Refund pending review</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/finance/refunds">Proses</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {refunds.length === 0 ? (
              <div className="text-center py-8"><p className="text-muted-foreground">Belum ada data</p></div>
            ) : (
              refunds.slice(0, 4).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-3 text-sm border-b border-border/40 last:border-0 pb-2.5 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.profiles?.name ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.reason}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm text-destructive">−{fmtRp(r.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("id-ID")}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Membership Revenue</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-4">
            {(() => {
              const tierMap: Record<string, { tier: string; subscribers: number; mrr: number }> = {};
              for (const row of revenueRows as any[]) {
                const tier = row.tier;
                const price = row.membership_plans?.price_monthly ?? 0;
                if (!tierMap[tier]) tierMap[tier] = { tier, subscribers: 0, mrr: 0 };
                tierMap[tier].subscribers += 1;
                tierMap[tier].mrr += price;
              }
              const tiers = Object.values(tierMap);
              if (tiers.length === 0) {
                return <div className="col-span-full text-center py-8"><p className="text-muted-foreground">Belum ada data</p></div>;
              }
              return tiers.map((m) => (
                <div key={m.tier} className="bg-secondary/60 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{m.tier}</span>
                  </div>
                  <p className="font-display text-2xl font-bold mt-2">{fmtRp(m.mrr)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.subscribers} subscribers · MRR</p>
                </div>
              ));
            })()}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
