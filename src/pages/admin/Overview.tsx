import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  FileText, Package, Wallet, ListChecks, Truck, AlertTriangle, ClipboardCheck, MessageSquare, TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  useAdminStats,
  useProcurementQueue,
  useTrackingExceptions,
  useScraperFailures,
  useQuoteApprovals,
} from "@/hooks";
import { fmtRp } from "@/lib/format";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "<1j";
  if (h < 24) return `${h}j`;
  return `${Math.floor(h / 24)}h`;
}

const Stat = ({ icon: Icon, label, value, delta, tone = "primary" }: any) => (
  <Card className="border-border/60">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="font-display text-2xl md:text-3xl font-bold mt-1">{value}</p>
          {delta && <p className="text-xs text-success font-semibold mt-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" />{delta}</p>}
        </div>
        <div className={`h-10 w-10 rounded-2xl grid place-items-center ${tone === "primary" ? "bg-primary-soft text-primary" : "bg-warning/15 text-warning"}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const QueueCard = ({ title, count, tone, href, items }: { title: string; count: number; tone: string; href: string; items: Array<{ left: string; right: string }> }) => (
  <Card className="border-border/60">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
      <div>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">{count} item butuh perhatian</p>
      </div>
      <Badge className={tone}>{count}</Badge>
    </CardHeader>
    <CardContent className="space-y-2">
      {items.slice(0, 3).map((it, i) => (
        <div key={i} className="flex items-center justify-between gap-3 text-sm border-b border-border/40 last:border-0 pb-2 last:pb-0">
          <span className="truncate font-medium">{it.left}</span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{it.right}</span>
        </div>
      ))}
      <Button variant="ghost" size="sm" asChild className="w-full mt-1">
        <Link to={href}>Lihat semua →</Link>
      </Button>
    </CardContent>
  </Card>
);

export default function AdminOverview() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useAdminStats();
  const { data: procurement = [], isLoading: procLoading, error: procError } = useProcurementQueue();
  const { data: tracking = [], isLoading: trkLoading, error: trkError } = useTrackingExceptions();
  const { data: scraper = [], isLoading: scrLoading, error: scrError } = useScraperFailures();
  const { data: approvals = [], isLoading: appLoading, error: appError } = useQuoteApprovals();

  const isLoading = statsLoading || procLoading || trkLoading || scrLoading || appLoading;
  const error = statsError || procError || trkError || scrError || appError;

  if (isLoading) return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-20 bg-secondary rounded-3xl" />
      <div className="h-20 bg-secondary rounded-3xl" />
    </div>
  );
  if (error) return (
    <div className="text-center py-12">
      <p className="text-destructive">Gagal memuat</p>
      <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Admin Ops"
        title="Hari ini di MyBagasi"
        description="Pantau quotation, order, procurement, dan exception secara real-time."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Stat icon={FileText} label="Quotation hari ini" value={stats?.quotationsToday ?? 0} />
        <Stat icon={Package} label="Order hari ini" value={stats?.ordersToday ?? 0} />
        <Stat icon={Wallet} label="GMV hari ini" value={fmtRp(stats?.gmvToday ?? 0)} />
        <Stat icon={Wallet} label="Pembayaran pending" value={stats?.paymentsPending ?? 0} tone="warn" />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <QueueCard
          title="Procurement Queue"
          count={stats?.procurementPending ?? 0}
          tone="bg-primary-soft text-primary"
          href="/admin/procurement"
          items={procurement.slice(0, 5).map((p: any) => ({ left: `${p.id} · ${p.product}`, right: timeAgo(p.created_at) }))}
        />
        <QueueCard
          title="Tracking Exceptions"
          count={stats?.trackingExceptions ?? 0}
          tone="bg-warning/15 text-warning"
          href="/admin/tracking"
          items={tracking.slice(0, 5).map((t: any) => ({ left: `${t.id} · ${t.issue}`, right: timeAgo(t.created_at) }))}
        />
        <QueueCard
          title="Scraper Failures"
          count={stats?.scraperFailures ?? 0}
          tone="bg-destructive/15 text-destructive"
          href="/admin/scraper"
          items={scraper.slice(0, 5).map((s: any) => ({ left: `${s.marketplaces?.name || "Unknown"} · ${s.reason}`, right: timeAgo(s.created_at) }))}
        />
        <QueueCard
          title="Quote Approval"
          count={stats?.approvalsQueue ?? 0}
          tone="bg-accent/15 text-accent"
          href="/admin/approvals"
          items={approvals.slice(0, 5).map((q: any) => ({ left: `${q.id} · ${q.profiles?.name || "—"}`, right: fmtRp(q.quotations?.total || 0) }))}
        />
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Shortcut</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: ListChecks, label: "Procurement", to: "/admin/procurement" },
            { icon: Truck, label: "Tracking", to: "/admin/tracking" },
            { icon: AlertTriangle, label: "Scraper", to: "/admin/scraper" },
            { icon: ClipboardCheck, label: "Approvals", to: "/admin/approvals" },
            { icon: MessageSquare, label: "Support", to: "/admin/support" },
            { icon: Package, label: "Batch Shipping", to: "/batch-shipping" },
            { icon: FileText, label: "Pre-order", to: "/preorder" },
          ].map((s) => (
            <Button key={s.to} variant="outline" asChild className="justify-start h-12 rounded-2xl">
              <Link to={s.to}><s.icon className="h-4 w-4" />{s.label}</Link>
            </Button>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
