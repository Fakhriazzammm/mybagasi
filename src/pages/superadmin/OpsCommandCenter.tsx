import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ArrowRight, AlertTriangle, Activity, Timer, BellRing, RefreshCcw } from "lucide-react";
import { useProcurementQueue, useTrackingExceptions, useScraperFailures, useQuoteApprovals } from "@/hooks";
import { fmtRp } from "@/lib/format";

const slaTone = (level: "green" | "yellow" | "red") => {
  if (level === "green") return "bg-success/15 text-success";
  if (level === "yellow") return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
};

const hoursSince = (iso?: string | null) => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 36e5));
};

export default function OpsCommandCenter() {
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());
  const { data: procurementQueue = [], isLoading: pqLoading, error: pqError } = useProcurementQueue();
  const { data: trackingExceptions = [], isLoading: trLoading, error: trError } = useTrackingExceptions();
  const { data: scraperFailures = [], isLoading: sfLoading, error: sfError } = useScraperFailures();
  const { data: quoteApprovals = [], isLoading: qaLoading, error: qaError } = useQuoteApprovals();

  useEffect(() => {
    const interval = setInterval(() => setLastRefreshedAt(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const isLoading = pqLoading || trLoading || sfLoading || qaLoading;
  const error = pqError || trError || sfError || qaError;

  const resolveProcurementSla = () => {
    const avgWait = Math.round((procurementQueue as any[]).reduce((sum, item) => sum + hoursSince(item.created_at), 0) / Math.max(1, procurementQueue.length));
    if (avgWait > 8) return { level: "red" as const, label: "Kritis" };
    if (avgWait > 4) return { level: "yellow" as const, label: "Perlu perhatian" };
    return { level: "green" as const, label: "Aman" };
  };

  const resolveTrackingSla = () => {
    const high = (trackingExceptions as any[]).filter((item) => item.severity === "high").length;
    if (high >= 2) return { level: "red" as const, label: "Kritis" };
    if (high === 1) return { level: "yellow" as const, label: "Perlu perhatian" };
    return { level: "green" as const, label: "Aman" };
  };

  const resolveScraperSla = () => {
    const retriesHigh = (scraperFailures as any[]).filter((item) => (item.retries ?? 0) >= 4).length;
    if (retriesHigh >= 2) return { level: "red" as const, label: "Kritis" };
    if (retriesHigh >= 1) return { level: "yellow" as const, label: "Perlu perhatian" };
    return { level: "green" as const, label: "Aman" };
  };

  const resolveApprovalSla = () => {
    if (quoteApprovals.length >= 8) return { level: "red" as const, label: "Kritis" };
    if (quoteApprovals.length >= 4) return { level: "yellow" as const, label: "Perlu perhatian" };
    return { level: "green" as const, label: "Aman" };
  };

  const queueCards = useMemo(() => [
    { title: "Procurement Queue", count: procurementQueue.length, href: "/admin/procurement", sla: resolveProcurementSla(), detail: `${(procurementQueue as any[]).filter((item) => item.priority === "high").length} high priority` },
    { title: "Tracking Exceptions", count: trackingExceptions.length, href: "/admin/tracking", sla: resolveTrackingSla(), detail: `${(trackingExceptions as any[]).filter((item) => item.severity === "high").length} severity tinggi` },
    { title: "Scraper Failures", count: scraperFailures.length, href: "/admin/scraper", sla: resolveScraperSla(), detail: `${(scraperFailures as any[]).filter((item) => (item.retries ?? 0) >= 4).length} retry tinggi` },
    { title: "Quote Approvals", count: quoteApprovals.length, href: "/admin/approvals", sla: resolveApprovalSla(), detail: "Review manual tertunda" },
  ], [procurementQueue, trackingExceptions, scraperFailures, quoteApprovals]);

  const criticalQueues = queueCards.filter((item) => item.sla.level === "red").length;
  const urgentItems = [
    ...(procurementQueue as any[]).slice(0, 2).map((item) => ({ key: item.id, title: `${item.id} - ${item.product}`, meta: `Procurement wait ${hoursSince(item.created_at)} jam` })),
    ...(trackingExceptions as any[]).slice(0, 2).map((item) => ({ key: item.id, title: `${item.id} - ${item.issue}`, meta: `Tracking severity ${item.severity}` })),
    ...(scraperFailures as any[]).slice(0, 2).map((item) => ({ key: item.id, title: `${item.source} - ${item.reason}`, meta: `Retry ${item.retries ?? 0}x` })),
  ];
  const backlogValue = (quoteApprovals as any[]).reduce((sum, item) => sum + (item.total ?? item.quotations?.total ?? 0), 0);

  if (isLoading) return <div className="p-6 animate-pulse space-y-4"><div className="h-20 bg-secondary rounded-3xl" /><div className="h-20 bg-secondary rounded-3xl" /></div>;
  if (error) return <div className="text-center py-12"><p className="text-destructive">Gagal memuat command center</p><p className="text-xs text-muted-foreground">{(error as Error).message}</p></div>;

  return (
    <>
      <PageHeader eyebrow="Super Admin" title="Ops Command Center" description="Satu panel gabungan real-time untuk procurement, tracking exception, scraper reliability, dan approval queue." action={<div className="flex items-center gap-2"><Badge className={criticalQueues > 0 ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}><BellRing className="h-3.5 w-3.5 mr-1" />{criticalQueues > 0 ? `${criticalQueues} alert kritis` : "Tidak ada alert kritis"}</Badge><Button variant="hero" size="sm" asChild><Link to="/admin">Buka Admin Ops</Link></Button></div>} />
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><RefreshCcw className="h-3.5 w-3.5" />Realtime Supabase · terakhir render {lastRefreshedAt.toLocaleTimeString("id-ID")}</div>
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card className="border-border/60 md:col-span-2"><CardContent className="p-5 flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Queue kritis (SLA merah)</p><p className="font-display text-3xl font-bold mt-1 text-destructive">{criticalQueues}</p></div><div className="h-11 w-11 rounded-2xl bg-destructive/15 text-destructive grid place-items-center"><AlertTriangle className="h-5 w-5" /></div></CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Total queue aktif</p><p className="font-display text-3xl font-bold mt-1">{procurementQueue.length + trackingExceptions.length + scraperFailures.length + quoteApprovals.length}</p></CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Estimasi backlog value</p><p className="font-display text-2xl font-bold mt-1">{fmtRp(backlogValue)}</p></CardContent></Card>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">{queueCards.map((item) => (<Card key={item.title} className="border-border/60"><CardHeader className="pb-2"><CardTitle className="text-base">{item.title}</CardTitle></CardHeader><CardContent><div className="flex items-center justify-between mb-2"><p className="font-display text-3xl font-bold">{item.count}</p><Badge className={slaTone(item.sla.level)}>SLA {item.sla.label}</Badge></div><p className="text-xs text-muted-foreground mb-4">{item.detail}</p><Button variant="outline" size="sm" className="w-full" asChild><Link to={item.href}>Lihat detail <ArrowRight className="h-4 w-4" /></Link></Button></CardContent></Card>))}</div>
      <div className="grid lg:grid-cols-3 gap-4"><Card className="border-border/60 lg:col-span-2"><CardHeader><CardTitle className="text-base">Antrian paling perlu tindakan</CardTitle></CardHeader><CardContent className="space-y-3">{urgentItems.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada antrean aktif.</p> : urgentItems.map((item) => (<div key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 p-3"><div className="min-w-0"><p className="text-sm font-medium truncate">{item.title}</p><p className="text-xs text-muted-foreground">{item.meta}</p></div><Badge className="bg-warning/15 text-warning">Action</Badge></div>))}</CardContent></Card><Card className="border-border/60"><CardHeader><CardTitle className="text-base">SLA Guide</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-success" />Hijau: di bawah threshold harian</div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-warning" />Kuning: approaching SLA breach</div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-destructive" />Merah: breach, prioritaskan sekarang</div><div className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">Panel ini memakai tabel operasional live, bukan mock data.</div><div className="flex gap-2"><Badge className="bg-secondary text-foreground"><Timer className="h-3 w-3 mr-1" />SLA-based</Badge><Badge className="bg-secondary text-foreground"><Activity className="h-3 w-3 mr-1" />Queue health</Badge></div></CardContent></Card></div>
    </>
  );
}
