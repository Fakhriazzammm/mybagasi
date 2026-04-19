import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { refunds, fmtRp } from "@/lib/finance-mock";
import { Check, X, FileText } from "lucide-react";

const tone: Record<string, string> = {
  pending_review: "bg-warning/15 text-warning",
  approved: "bg-primary-soft text-primary",
  processing: "bg-accent/15 text-accent",
  completed: "bg-success/15 text-success",
};

const label: Record<string, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  processing: "Processing",
  completed: "Completed",
};

export default function Refunds() {
  return (
    <>
      <PageHeader eyebrow="Finance" title="Refund Queue" description="Permintaan refund yang perlu review dan diproses." />
      <div className="grid gap-3">
        {refunds.map((r) => (
          <Card key={r.id} className="border-border/60">
            <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-2xl bg-destructive/10 text-destructive grid place-items-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">{r.id}</span>
                    <span className="font-mono text-xs text-muted-foreground">{r.order}</span>
                    <Badge className={tone[r.status]}>{label[r.status]}</Badge>
                  </div>
                  <p className="font-semibold mt-1">{r.customer}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.reason} · {r.at}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-display text-lg font-bold text-destructive">−{fmtRp(r.amount)}</p>
                {r.status === "pending_review" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="text-destructive"><X className="h-4 w-4" /></Button>
                    <Button size="sm" variant="hero"><Check className="h-4 w-4" />Setujui</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
