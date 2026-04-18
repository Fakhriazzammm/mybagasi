import { Bell, TrendingDown, Plus, Pause } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { priceAlerts, fmtRp } from "@/lib/customer-mock";

const PriceAlerts = () => (
  <>
    <PageHeader
      eyebrow="Price Alerts"
      title="Pantau harga impianmu"
      description="Kami pantau 24/7 dan kabari saat target harga tercapai atau stok ready."
      action={<Button variant="hero"><Plus className="h-4 w-4" />Buat Alert</Button>}
    />

    <div className="space-y-3">
      {priceAlerts.map((a) => {
        const diff = a.currentPrice - a.targetPrice;
        const triggered = a.status === "triggered";
        return (
          <div key={a.id} className={`rounded-3xl border p-5 shadow-soft ${triggered ? "bg-success/5 border-success/30" : "bg-card border-border/40"}`}>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className={`h-12 w-12 rounded-2xl grid place-items-center shrink-0 ${triggered ? "bg-success text-success-foreground" : "bg-primary-soft text-primary"}`}>
                {triggered ? <TrendingDown className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{a.product}</p>
                  {triggered && <span className="text-[10px] px-2 py-0.5 rounded-full bg-success text-success-foreground font-semibold">TARGET TERCAPAI</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Target {fmtRp(a.targetPrice)} · Cek terakhir {a.lastChecked}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Harga sekarang</p>
                  <p className="font-display text-xl font-bold">{fmtRp(a.currentPrice)}</p>
                  <p className={`text-xs font-semibold ${diff > 0 ? "text-warning" : "text-success"}`}>
                    {diff > 0 ? `+${fmtRp(diff)}` : fmtRp(diff)} dari target
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  {triggered ? (
                    <Button variant="hero" size="sm">Beli Sekarang</Button>
                  ) : (
                    <Button variant="outline" size="sm">Edit Target</Button>
                  )}
                  <Button variant="ghost" size="sm"><Pause className="h-3.5 w-3.5" />Pause</Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </>
);

export default PriceAlerts;
