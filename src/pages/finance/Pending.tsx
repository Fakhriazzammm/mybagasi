import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { usePayments } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { Bell, Clock } from "lucide-react";

export default function Pending() {
  const { data: payments = [], isLoading, error } = usePayments("pending");

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 p-6">
        <div className="h-20 bg-secondary rounded-3xl" />
        <div className="h-20 bg-secondary rounded-3xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Gagal memuat</p>
        <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Belum ada data</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Finance" title="Pending Payment" description="Customer yang sudah generate VA/QRIS tapi belum bayar." />
      <div className="grid gap-3">
        {payments.map((p) => (
          <Card key={p.id} className="border-warning/30 bg-warning/5">
            <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-2xl bg-warning/15 text-warning grid place-items-center">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">
                    {(p as any).profiles?.name ?? "—"}
                    <span className="font-mono text-xs text-muted-foreground ml-1">{p.id.slice(0, 8)}…</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.method} · {new Date(p.created_at).toLocaleString("id-ID")}</p>
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
