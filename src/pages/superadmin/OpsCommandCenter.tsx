import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { procurementQueue, trackingExceptions, scraperFailures, quoteApprovals, fmtRp } from "@/lib/admin-mock";
import { ArrowRight, AlertTriangle, Activity, Timer } from "lucide-react";

const slaTone = (level: "green" | "yellow" | "red") => {
  if (level === "green") return "bg-success/15 text-success";
  if (level === "yellow") return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
};

const resolveProcurementSla = () => {
  const avgWait = Math.round(procurementQueue.reduce((sum, item) => sum + item.waitingHours, 0) / Math.max(1, procurementQueue.length));
  if (avgWait > 8) return { level: "red" as const, label: "Kritis" };
  if (avgWait > 4) return { level: "yellow" as const, label: "Perlu perhatian" };
  return { level: "green" as const, label: "Aman" };
};

const resolveTrackingSla = () => {
  const high = trackingExceptions.filter((item) => item.severity === "high").length;
  if (high >= 2) return { level: "red" as const, label: "Kritis" };
  if (high === 1) return { level: "yellow" as const, label: "Perlu perhatian" };
  return { level: "green" as const, label: "Aman" };
};

const resolveScraperSla = () => {
  const retriesHigh = scraperFailures.filter((item) => item.retries >= 4).length;
  if (retriesHigh >= 2) return { level: "red" as const, label: "Kritis" };
  if (retriesHigh >= 1) return { level: "yellow" as const, label: "Perlu perhatian" };
  return { level: "green" as const, label: "Aman" };
};

const resolveApprovalSla = () => {
  if (quoteApprovals.length >= 8) return { level: "red" as const, label: "Kritis" };
  if (quoteApprovals.length >= 4) return { level: "yellow" as const, label: "Perlu perhatian" };
  return { level: "green" as const, label: "Aman" };
};

const queueCards = [
  {
    title: "Procurement Queue",
    count: procurementQueue.length,
    href: "/admin/procurement",
    sla: resolveProcurementSla(),
    detail: `${procurementQueue.filter((item) => item.priority === "high").length} high priority`,
  },
  {
    title: "Tracking Exceptions",
    count: trackingExceptions.length,
    href: "/admin/tracking",
    sla: resolveTrackingSla(),
    detail: `${trackingExceptions.filter((item) => item.severity === "high").length} severity tinggi`,
  },
  {
    title: "Scraper Failures",
    count: scraperFailures.length,
    href: "/admin/scraper",
    sla: resolveScraperSla(),
    detail: `${scraperFailures.filter((item) => item.retries >= 4).length} retry tinggi`,
  },
  {
    title: "Quote Approvals",
    count: quoteApprovals.length,
    href: "/admin/approvals",
    sla: resolveApprovalSla(),
    detail: "Review manual tertunda",
  },
];

export default function OpsCommandCenter() {
  const criticalQueues = queueCards.filter((item) => item.sla.level === "red").length;

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Ops Command Center"
        description="Satu panel gabungan untuk procurement, tracking exception, scraper reliability, dan approval queue."
        action={<Button variant="hero" size="sm" asChild><Link to="/admin">Buka Admin Ops</Link></Button>}
      />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card className="border-border/60 md:col-span-2">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Queue kritis (SLA merah)</p>
              <p className="font-display text-3xl font-bold mt-1 text-destructive">{criticalQueues}</p>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-destructive/15 text-destructive grid place-items-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total queue aktif</p>
            <p className="font-display text-3xl font-bold mt-1">{procurementQueue.length + trackingExceptions.length + scraperFailures.length + quoteApprovals.length}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Estimasi backlog value</p>
            <p className="font-display text-2xl font-bold mt-1">{fmtRp(quoteApprovals.reduce((sum, item) => sum + item.total, 0))}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {queueCards.map((item) => (
          <Card key={item.title} className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <p className="font-display text-3xl font-bold">{item.count}</p>
                <Badge className={slaTone(item.sla.level)}>SLA {item.sla.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-4">{item.detail}</p>
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link to={item.href}>Lihat detail <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Antrian paling perlu tindakan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ...procurementQueue.slice(0, 2).map((item) => ({
                key: item.id,
                title: `${item.id} - ${item.product}`,
                meta: `Procurement wait ${item.waitingHours} jam`,
              })),
              ...trackingExceptions.slice(0, 2).map((item) => ({
                key: item.id,
                title: `${item.id} - ${item.issue}`,
                meta: `Tracking severity ${item.severity}`,
              })),
              ...scraperFailures.slice(0, 2).map((item) => ({
                key: item.id,
                title: `${item.source} - ${item.reason}`,
                meta: `Retry ${item.retries}x`,
              })),
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.meta}</p>
                </div>
                <Badge className="bg-warning/15 text-warning">Action</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">SLA Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-success" />Hijau: di bawah threshold harian</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-warning" />Kuning: approaching SLA breach</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-destructive" />Merah: breach, prioritaskan sekarang</div>
            <div className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
              Panel ini dirancang untuk triase cepat. Gunakan sebagai control tower sebelum masuk ke halaman detail ops.
            </div>
            <div className="flex gap-2">
              <Badge className="bg-secondary text-foreground"><Timer className="h-3 w-3 mr-1" />SLA-based</Badge>
              <Badge className="bg-secondary text-foreground"><Activity className="h-3 w-3 mr-1" />Queue health</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
