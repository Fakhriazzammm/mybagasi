import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useScraperFailures } from "@/hooks";
import { RefreshCw, ExternalLink, Wrench } from "lucide-react";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "<1j";
  if (h < 24) return `${h}j`;
  return `${Math.floor(h / 24)}h`;
}

export default function ScraperFailuresPage() {
  const { data: failures = [], isLoading, error } = useScraperFailures();

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
  if (!failures.length) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Belum ada data</p>
    </div>
  );

  const sourceCounts = failures.reduce((acc: Record<string, number>, s: any) => {
    const name = s.marketplaces?.name || "Unknown";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Scraper Failures"
        description="Halaman produk yang gagal di-scrape — perlu investigasi atau retry manual."
        action={<Button variant="hero" size="sm"><RefreshCw className="h-4 w-4" />Retry semua</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(sourceCounts).slice(0, 4).map(([src, count]) => (
          <Card key={src} className="border-border/60">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{src}</p>
              <p className="font-display text-2xl font-bold mt-1">{count as number}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">gagal</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Retry</TableHead>
                <TableHead>Since</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.id}</TableCell>
                  <TableCell><Badge variant="outline">{s.marketplaces?.name || "Unknown"}</Badge></TableCell>
                  <TableCell className="font-mono text-xs max-w-[240px] truncate">{s.url}</TableCell>
                  <TableCell className="max-w-[260px]"><span className="text-sm">{s.reason}</span></TableCell>
                  <TableCell><Badge className={s.retries >= 4 ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}>{s.retries}×</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{timeAgo(s.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost"><ExternalLink className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost"><Wrench className="h-4 w-4" /></Button>
                      <Button size="sm" variant="soft"><RefreshCw className="h-4 w-4" />Retry</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
