import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useMarketplaces, useToggleMarketplace } from "@/hooks";
import { Plus, Settings } from "lucide-react";

export default function Marketplaces() {
  const { data: marketplaces = [], isLoading, error } = useMarketplaces();
  const toggleMutation = useToggleMarketplace();

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Supported Marketplaces"
        description="Aktifkan / nonaktifkan source marketplace dan pantau scraper health."
        action={<Button variant="hero" size="sm"><Plus className="h-4 w-4" />Tambah source</Button>}
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Memuat marketplace...</p>
      ) : error ? (
        <p className="text-sm text-destructive">Gagal memuat marketplace.</p>
      ) : marketplaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada marketplace terdaftar.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {marketplaces.map((m) => (
            <Card key={m.id} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display text-lg font-bold">{m.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{m.domain}</p>
                  </div>
                  <Switch
                    defaultChecked={m.active}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: m.id, active: checked })}
                    disabled={toggleMutation.isPending}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="bg-secondary/60 rounded-xl p-2.5">
                    <p className="text-[10px] uppercase text-muted-foreground">Scraper</p>
                    <Badge className={m.scraper_health >= 95 ? "bg-success/15 text-success mt-0.5" : m.scraper_health >= 90 ? "bg-warning/15 text-warning mt-0.5" : "bg-destructive/15 text-destructive mt-0.5"}>
                      {m.scraper_health}%
                    </Badge>
                  </div>
                  <div className="bg-secondary/60 rounded-xl p-2.5">
                    <p className="text-[10px] uppercase text-muted-foreground">Orders MTD</p>
                    <p className="font-bold text-sm mt-0.5">{m.orders_mtd}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-3"><Settings className="h-4 w-4" />Konfigurasi</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
