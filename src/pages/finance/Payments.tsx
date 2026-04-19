import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { payments, fmtRp } from "@/lib/finance-mock";
import { Download } from "lucide-react";
import { toast } from "sonner";

const tone: Record<string, string> = {
  settled: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  failed: "bg-destructive/15 text-destructive",
};

export default function Payments() {
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Pembayaran Masuk"
        description="Semua transaksi customer — settled, pending, dan failed."
        action={<Button variant="outline" size="sm" onClick={() => toast.success("Export CSV siap diunduh")}><Download className="h-4 w-4" />Export CSV</Button>}
      />
      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment ID</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Waktu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell className="font-mono text-xs">{p.order}</TableCell>
                  <TableCell className="font-medium">{p.customer}</TableCell>
                  <TableCell className="text-sm">{p.method}</TableCell>
                  <TableCell className="font-semibold">{fmtRp(p.amount)}</TableCell>
                  <TableCell><Badge className={tone[p.status]}>{p.status}</Badge></TableCell>
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
