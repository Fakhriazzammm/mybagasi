import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePayments } from "@/hooks";
import { fmtRp } from "@/lib/finance-mock";

const tone: Record<string, string> = {
  settled: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  failed: "bg-destructive/15 text-destructive",
};

export default function Payments() {
  const { data: payments = [], isLoading } = usePayments();

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Pembayaran Masuk"
        description="Semua transaksi customer — settled, pending, dan failed."
        action={
          <Button variant="outline" size="sm" onClick={() => toast.success("Export CSV siap diunduh")}>
            <Download className="h-4 w-4" />Export CSV
          </Button>
        }
      />
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
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
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      Belum ada data pembayaran.
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.id.slice(0, 8)}…</TableCell>
                      <TableCell className="font-mono text-xs">
                        {(p as any).orders?.id?.slice(0, 8) ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {(p as any).profiles?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{p.method}</TableCell>
                      <TableCell className="font-semibold">{fmtRp(p.amount)}</TableCell>
                      <TableCell><Badge className={tone[p.status]}>{p.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString("id-ID")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
