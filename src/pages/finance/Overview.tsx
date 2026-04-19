import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { TrendingUp, Wallet, Clock, Undo2, Coins, Crown, Users, Download } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { financeStats, fmtRp, payments, refunds, membershipRevenue } from "@/lib/finance-mock";
import { toast } from "sonner";

const Stat = ({ icon: Icon, label, value, delta, href, tone = "primary" }: any) => (
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
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Ringkasan Keuangan"
        description="Pantau cashflow MyBagasi: pembayaran masuk, pending, refund, dan revenue membership."
        action={
          <Button variant="hero" size="sm" onClick={() => toast.success("Export berjalan", { description: "Laporan lengkap dikirim via email." })}>
            <Download className="h-4 w-4" />Export semua
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Stat icon={Wallet} label="Payment hari ini" value={fmtRp(financeStats.paymentsToday)} delta={financeStats.paymentsDelta} href="/finance/payments" />
        <Stat icon={Clock} label={`Pending (${financeStats.pendingCount})`} value={fmtRp(financeStats.pendingPayment)} tone="warn" href="/finance/pending" />
        <Stat icon={Undo2} label={`Refund queue (${financeStats.refundsCount})`} value={fmtRp(financeStats.refundsQueue)} tone="warn" href="/finance/refunds" />
        <Stat icon={Crown} label="Membership MTD" value={fmtRp(financeStats.membershipMtd)} tone="accent" href="/finance/membership" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Stat icon={Users} label="Affiliate utang" value={fmtRp(financeStats.affiliateOwed)} tone="accent" href="/finance/affiliate" />
        <Stat icon={Coins} label="Liabilitas poin" value={fmtRp(financeStats.pointsLiability)} href="/finance/points" />
        <Stat icon={TrendingUp} label="GMV MTD" value={fmtRp(financeStats.gmvMtd)} delta="+19%" />
        <Stat icon={Wallet} label="Net revenue MTD" value={fmtRp(financeStats.gmvMtd * 0.08)} delta="+22%" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Pembayaran terbaru</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/finance/payments">Lihat semua</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {payments.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm border-b border-border/40 last:border-0 pb-2.5 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.customer}</p>
                  <p className="text-[11px] text-muted-foreground">{p.method} · {p.at}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm">{fmtRp(p.amount)}</p>
                  <Badge className={p.status === "settled" ? "bg-success/15 text-success" : p.status === "pending" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"}>
                    {p.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Refund pending review</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/finance/refunds">Proses</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {refunds.slice(0, 4).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 text-sm border-b border-border/40 last:border-0 pb-2.5 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.customer}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.reason}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm text-destructive">−{fmtRp(r.amount)}</p>
                  <p className="text-[10px] text-muted-foreground">{r.at}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Membership Revenue</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-4">
            {membershipRevenue.map((m) => (
              <div key={m.tier} className="bg-secondary/60 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{m.tier}</span>
                  <Badge className="bg-success/15 text-success">{m.growth}</Badge>
                </div>
                <p className="font-display text-2xl font-bold mt-2">{fmtRp(m.mrr)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.subscribers} subscribers · MRR</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
