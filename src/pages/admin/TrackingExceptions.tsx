import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { trackingExceptions } from "@/lib/admin-mock";
import { AlertCircle, MessageCircle, RefreshCw } from "lucide-react";

const severityTone: Record<string, string> = {
  high: "bg-destructive/15 text-destructive border-destructive/20",
  medium: "bg-warning/15 text-warning border-warning/20",
  low: "bg-muted text-muted-foreground border-border",
};

export default function TrackingExceptionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Tracking Exceptions"
        description="Order dengan masalah pengiriman atau update tracking yang macet."
      />

      <div className="grid gap-4">
        {trackingExceptions.map((t) => (
          <Card key={t.id} className={`border ${severityTone[t.severity]}`}>
            <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-2xl bg-background grid place-items-center shrink-0">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">{t.id}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">{t.severity}</Badge>
                    <span className="text-xs text-muted-foreground">{t.since}</span>
                  </div>
                  <p className="font-semibold mt-1">{t.issue}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.customer} · Tracking <span className="font-mono">{t.tracking}</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline"><RefreshCw className="h-4 w-4" />Refresh</Button>
                <Button size="sm" variant="hero"><MessageCircle className="h-4 w-4" />Hubungi customer</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
