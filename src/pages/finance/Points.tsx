import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { pointLedger, financeStats, fmtRp } from "@/lib/finance-mock";

const tone: Record<string, string> = {
  earn: "bg-success/15 text-success",
  redeem: "bg-primary-soft text-primary",
  expire: "bg-muted text-muted-foreground",
};

export default function PointsLedger() {
  return (
    <>
      <PageHeader eyebrow="Finance" title="Point Ledger" description="Histori earn, redeem, dan expire poin customer." />
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <Card className="border-border/60"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total liabilitas poin</p>
          <p className="font-display text-2xl font-bold mt-1">{fmtRp(financeStats.pointsLiability)}</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Earned hari ini</p>
          <p className="font-display text-2xl font-bold mt-1 text-success">+{pointLedger.filter(p => p.type === "earn").reduce((s, p) => s + p.amount, 0).toLocaleString("id-ID")}</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Redeemed hari ini</p>
          <p className="font-display text-2xl font-bold mt-1 text-primary">{pointLedger.filter(p => p.type === "redeem").reduce((s, p) => s + p.amount, 0).toLocaleString("id-ID")}</p>
        </CardContent></Card>
      </div>
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
              {pointLedger.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell className="font-medium">{p.customer}</TableCell>
                  <TableCell><Badge className={tone[p.type]}>{p.type}</Badge></TableCell>
                  <TableCell className={`font-mono font-semibold ${p.amount > 0 ? "text-success" : "text-destructive"}`}>
                    {p.amount > 0 ? "+" : ""}{p.amount.toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.ref}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
