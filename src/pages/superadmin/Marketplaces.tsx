import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { marketplaces } from "@/lib/superadmin-mock";
import { scraperFailures } from "@/lib/admin-mock";
import { Plus, Settings, ShieldCheck, RefreshCcw } from "lucide-react";

const topReasonPerMarketplace = Object.entries(
  scraperFailures.reduce<Record<string, Record<string, number>>>((acc, failure) => {
    if (!acc[failure.source]) acc[failure.source] = {};
    acc[failure.source][failure.reason] = (acc[failure.source][failure.reason] || 0) + 1;
    return acc;
  }, {}),
)
  .map(([source, reasonCounts]) => {
    const top = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];
    return {
      source,
      reason: top?.[0] || "Tidak ada error",
      count: top?.[1] || 0,
    };
  })
  .sort((a, b) => b.count - a.count);

export default function Marketplaces() {
  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Supported Marketplaces"
        description="Aktifkan source marketplace, pantau scraper health, dan monitor error reason yang paling sering muncul."
        action={<Button variant="hero" size="sm"><Plus className="h-4 w-4" />Tambah source</Button>}
      />

      <div className="rounded-3xl border border-border/60 bg-secondary/30 p-4 mb-5 flex flex-wrap items-center gap-3 text-sm">
        <Badge className="bg-success/15 text-success"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Fallback Parser Aktif</Badge>
        <Badge className="bg-warning/15 text-warning"><RefreshCcw className="h-3.5 w-3.5 mr-1" />Tiered Retry 3 tahap</Badge>
        <span className="text-muted-foreground">Strategi reliability: retry bertingkat untuk transient errors + parser fallback saat scrape utama gagal.</span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {marketplaces.map((m) => (
          <Card key={m.id} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-lg font-bold">{m.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{m.domain}</p>
                </div>
                <Switch defaultChecked={m.active} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="bg-secondary/60 rounded-xl p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Scraper</p>
                  <Badge className={m.scraperHealth >= 95 ? "bg-success/15 text-success mt-0.5" : m.scraperHealth >= 90 ? "bg-warning/15 text-warning mt-0.5" : "bg-destructive/15 text-destructive mt-0.5"}>
                    {m.scraperHealth}%
                  </Badge>
                </div>
                <div className="bg-secondary/60 rounded-xl p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Orders MTD</p>
                  <p className="font-bold text-sm mt-0.5">{m.ordersMtd}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-3"><Settings className="h-4 w-4" />Konfigurasi</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <h2 className="font-display text-lg font-bold mb-3">Dashboard error reason paling sering per marketplace</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {topReasonPerMarketplace.length === 0 ? (
            <Card className="border-border/60 lg:col-span-3">
              <CardContent className="p-5 text-sm text-muted-foreground">Belum ada data error scraper.</CardContent>
            </Card>
          ) : (
            topReasonPerMarketplace.map((item) => (
              <Card key={item.source} className="border-border/60">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold">{item.source}</p>
                    <Badge className="bg-destructive/15 text-destructive">{item.count}x</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.reason}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
