import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useQuoteApprovals, useReviewQuoteApproval } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { Check, X, Eye } from "lucide-react";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "<1j";
  if (h < 24) return `${h}j`;
  return `${Math.floor(h / 24)}h`;
}

export default function Approvals() {
  const { data: approvals = [], isLoading, error } = useQuoteApprovals();
  const reviewMutation = useReviewQuoteApproval();

  if (isLoading) return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-20 bg-secondary rounded-3xl" />
      <div className="h-20 bg-secondary rounded-3xl" />
    </div>
  );
  if (error) return (
    <div className="text-center py-12">
      <p className="text-destructive">Gagal memuat</p>
      <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
    </div>
  );
  if (!approvals.length) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Belum ada data</p>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Quote Approval Queue"
        description="Quotation yang perlu review manual sebelum dikirim ke customer."
      />

      <div className="grid md:grid-cols-2 gap-4">
        {approvals.map((q: any) => (
          <Card key={q.id} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">{q.id}</span>
                    <Badge variant="outline" className="text-[10px]">{timeAgo(q.created_at)}</Badge>
                  </div>
                  <h3 className="font-semibold mt-1.5">{q.quotations?.product || "—"}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{q.profiles?.name || "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">Total</p>
                  <p className="font-display text-lg font-bold text-primary">{fmtRp(q.quotations?.total || 0)}</p>
                </div>
              </div>
              <div className="bg-secondary/60 rounded-2xl p-3 text-xs mb-4">
                <p className="font-semibold mb-1">Alasan flagged</p>
                <p className="text-muted-foreground">{q.reason}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="flex-1"><Eye className="h-4 w-4" />Detail</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-destructive hover:bg-destructive/5"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ id: q.id, approved: false })}
                >
                  <X className="h-4 w-4" />Tolak
                </Button>
                <Button
                  size="sm"
                  variant="hero"
                  className="flex-1"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ id: q.id, approved: true })}
                >
                  <Check className="h-4 w-4" />Setujui
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
