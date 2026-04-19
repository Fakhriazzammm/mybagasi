import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { scraperFailures } from "@/lib/admin-mock";
import { RefreshCw, ExternalLink, Wrench } from "lucide-react";

export default function ScraperFailuresPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Scraper Failures"
        description="Halaman produk yang gagal di-scrape — perlu investigasi atau retry manual."
        action={<Button variant="hero" size="sm"><RefreshCw className="h-4 w-4" />Retry semua</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Array.from(new Set(scraperFailures.map(s => s.source))).slice(0, 4).map((src) => {
          const count = scraperFailures.filter(s => s.source === src).length;
          return (
            <Card key={src} className="border-border/60">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{src}</p>
                <p className="font-display text-2xl font-bold mt-1">{count}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">gagal</p>
              </CardContent>
            </Card>
          );
        })}
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
              {scraperFailures.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.id}</TableCell>
                  <TableCell><Badge variant="outline">{s.source}</Badge></TableCell>
                  <TableCell className="font-mono text-xs max-w-[240px] truncate">{s.url}</TableCell>
                  <TableCell className="max-w-[260px]"><span className="text-sm">{s.reason}</span></TableCell>
                  <TableCell><Badge className={s.retries >= 4 ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}>{s.retries}×</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.since}</TableCell>
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
