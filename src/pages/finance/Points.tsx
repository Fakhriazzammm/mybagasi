import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useAllPointsLedger, usePointsLiability } from "@/hooks";
import { fmtRp } from "@/lib/format";

const tone: Record<string, string> = {
  earn: "bg-success/15 text-success",
  redeem: "bg-primary-soft text-primary",
  expire: "bg-muted text-muted-foreground",
};

export default function PointsLedger() {
  const { data: ledger = [], isLoading: ledgerLoading, error: ledgerError } = useAllPointsLedger();
  const { data: liability, isLoading: liabilityLoading, error: liabilityError } = usePointsLiability();

  const isLoading = ledgerLoading || liabilityLoading;
  const error = ledgerError || liabilityError;

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

  const earnedToday = ledger
    .filter((p: any) => p.type === "earn")
    .reduce((s: number, p: any) => s + p.amount, 0);
  const redeemedToday = ledger
    .filter((p: any) => p.type === "redeem")
    .reduce((s: number, p: any) => s + p.amount, 0);

  return (
    <>
      <PageHeader eyebrow="Finance" title="Point Ledger" description="Histori earn, redeem, dan expire poin customer." />
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <Card className="border-border/60"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total liabilitas poin</p>
          <p className="font-display text-2xl font-bold mt-1">{fmtRp(liability ?? 0)}</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Earned hari ini</p>
          <p className="font-display text-2xl font-bold mt-1 text-success">+{earnedToday.toLocaleString("id-ID")}</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Redeemed hari ini</p>
          <p className="font-display text-2xl font-bold mt-1 text-primary">{redeemedToday.toLocaleString("id-ID")}</p>
        </CardContent></Card>
      </div>
      {ledger.length === 0 ? (
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
                  <TableHead>Customer</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Poin</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Waktu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id.slice(0, 8)}…</TableCell>
                    <TableCell className="font-medium">{p.profiles?.name ?? "—"}</TableCell>
                    <TableCell><Badge className={tone[p.type]}>{p.type}</Badge></TableCell>
                    <TableCell className={`font-mono font-semibold ${p.amount > 0 ? "text-success" : "text-destructive"}`}>
                      {p.amount > 0 ? "+" : ""}{p.amount.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.reference ?? p.order_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("id-ID")}</TableCell>
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
