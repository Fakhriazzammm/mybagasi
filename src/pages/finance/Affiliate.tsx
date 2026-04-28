import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useAffiliatePayouts, useAffiliateCommissionTiers } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { Send } from "lucide-react";

const tone: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-primary-soft text-primary",
  paid: "bg-success/15 text-success",
};

export default function AffiliatePayoutPage() {
  const { data: payouts = [], isLoading, error } = useAffiliatePayouts();

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

  const totalPending = payouts
    .filter((a: any) => a.status === "pending")
    .reduce((s: number, a: any) => s + a.commission, 0);

  return (
    <>
      <PageHeader eyebrow="Finance" title="Affiliate Payout" description="Komisi creator/affiliate yang harus dibayarkan." />
      <Card className="border-primary/30 bg-primary-soft/40 mb-6">
        <CardContent className="p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total pending</p>
            <p className="font-display text-3xl font-bold text-primary mt-1">{fmtRp(totalPending)}</p>
          </div>
          <Button variant="hero"><Send className="h-4 w-4" />Bayar semua pending</Button>
        </CardContent>
      </Card>

      {payouts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Belum ada data</p>
        </div>
      ) : (
        <Card className="border-border/60">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Affiliate</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Komisi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.id.slice(0, 8)}…</TableCell>
                    <TableCell className="font-medium">{a.profiles?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{a.period}</TableCell>
                    <TableCell>{a.orders_count}</TableCell>
                    <TableCell className="font-semibold">{fmtRp(a.commission)}</TableCell>
                    <TableCell><Badge className={tone[a.status]}>{a.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {a.status !== "paid" && <Button size="sm" variant="soft">Bayar</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
