import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { payments, fmtRp } from "@/lib/finance-mock";
import { Bell, Clock } from "lucide-react";

export default function Pending() {
  const pending = payments.filter((p) => p.status === "pending");
  return (
    <>
      <PageHeader eyebrow="Finance" title="Pending Payment" description="Customer yang sudah generate VA/QRIS tapi belum bayar." />
      <div className="grid gap-3">
        {pending.map((p) => (
          <Card key={p.id} className="border-warning/30 bg-warning/5">
            <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-2xl bg-warning/15 text-warning grid place-items-center">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{p.customer} <span className="font-mono text-xs text-muted-foreground ml-1">{p.order}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.method} · {p.at}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-display text-lg font-bold">{fmtRp(p.amount)}</p>
                  <Badge className="bg-warning/15 text-warning">Belum bayar</Badge>
                </div>
                <Button size="sm" variant="hero"><Bell className="h-4 w-4" />Reminder</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
