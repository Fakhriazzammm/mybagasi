import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { quoteApprovals, fmtRp } from "@/lib/admin-mock";
import { Check, X, Eye } from "lucide-react";

export default function Approvals() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Quote Approval Queue"
        description="Quotation yang perlu review manual sebelum dikirim ke customer."
      />

      <div className="grid md:grid-cols-2 gap-4">
        {quoteApprovals.map((q) => (
          <Card key={q.id} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">{q.id}</span>
                    <Badge variant="outline" className="text-[10px]">{q.submitted}</Badge>
                  </div>
                  <h3 className="font-semibold mt-1.5">{q.product}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{q.customer}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">Total</p>
                  <p className="font-display text-lg font-bold text-primary">{fmtRp(q.total)}</p>
                </div>
              </div>
              <div className="bg-secondary/60 rounded-2xl p-3 text-xs mb-4">
                <p className="font-semibold mb-1">Alasan flagged</p>
                <p className="text-muted-foreground">{q.reason}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="flex-1"><Eye className="h-4 w-4" />Detail</Button>
                <Button size="sm" variant="outline" className="flex-1 text-destructive hover:bg-destructive/5"><X className="h-4 w-4" />Tolak</Button>
                <Button size="sm" variant="hero" className="flex-1"><Check className="h-4 w-4" />Setujui</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
