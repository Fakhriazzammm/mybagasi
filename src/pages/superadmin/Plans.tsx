import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useMembershipPlans } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { Crown, Edit3, Plus } from "lucide-react";

export default function Plans() {
  const { data: plans = [], isLoading, error } = useMembershipPlans();

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Membership Plans"
        description="Atur tier, harga, dan benefit setiap membership."
        action={<Button variant="hero" size="sm"><Plus className="h-4 w-4" />Tambah plan</Button>}
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Memuat membership plans...</p>
      ) : error ? (
        <p className="text-sm text-destructive">Gagal memuat membership plans.</p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada membership plan.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {plans.map((p) => (
            <Card key={p.id} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Crown className="h-5 w-5 text-primary" />
                      <span className="font-display text-xl font-bold">{p.name}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">{p.id.slice(0, 8)}</Badge>
                    </div>
                    <p className="font-display text-2xl font-bold mt-2">
                      {p.price_monthly === 0 ? "Gratis" : fmtRp(p.price_monthly)}
                      {p.price_monthly > 0 && <span className="text-sm font-normal text-muted-foreground">/bln</span>}
                    </p>
                  </div>
                  <Switch defaultChecked={p.active} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-secondary/60 rounded-2xl p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Diskon fee</p>
                    <p className="font-bold mt-0.5">{p.discount_percent}%</p>
                  </div>
                  <div className="bg-secondary/60 rounded-2xl p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Multiplier poin</p>
                    <p className="font-bold mt-0.5">{p.point_multiplier}×</p>
                  </div>
                  <div className="bg-secondary/60 rounded-2xl p-3 col-span-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Priority procurement</p>
                    <p className="font-bold mt-0.5">{p.priority_procurement ? "✓ Aktif" : "—"}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-4"><Edit3 className="h-4 w-4" />Edit plan</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
