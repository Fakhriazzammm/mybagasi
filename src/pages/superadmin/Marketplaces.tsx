import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { marketplaces } from "@/lib/superadmin-mock";
import { Plus, Settings } from "lucide-react";

export default function Marketplaces() {
  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Supported Marketplaces"
        description="Aktifkan / nonaktifkan source marketplace dan pantau scraper health."
        action={<Button variant="hero" size="sm"><Plus className="h-4 w-4" />Tambah source</Button>}
      />
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
    </>
  );
}
