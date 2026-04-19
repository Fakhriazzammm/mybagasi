import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { procurementQueue, fmtJpy } from "@/lib/admin-mock";
import { ShoppingCart, UserPlus } from "lucide-react";

const priorityTone: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  normal: "bg-primary-soft text-primary",
  low: "bg-muted text-muted-foreground",
};

export default function Procurement() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Procurement Queue"
        description="Antrian order yang perlu dibeli dari marketplace Jepang."
        action={<Button variant="hero" size="sm"><ShoppingCart className="h-4 w-4" />Bulk purchase</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total queue", value: procurementQueue.length },
          { label: "High priority", value: procurementQueue.filter(p => p.priority === "high").length, tone: "text-destructive" },
          { label: "Belum di-assign", value: procurementQueue.filter(p => p.assigned === "—").length, tone: "text-warning" },
          { label: "Rata-rata wait", value: Math.round(procurementQueue.reduce((s, p) => s + p.waitingHours, 0) / procurementQueue.length) + "j" },
        ].map((s) => (
          <Card key={s.label} className="border-border/60">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`font-display text-2xl font-bold mt-1 ${s.tone || ""}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Produk</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Harga</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Wait</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {procurementQueue.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell className="font-medium">{p.customer}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{p.product}</TableCell>
                  <TableCell className="text-xs">{p.source}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtJpy(p.price)}</TableCell>
                  <TableCell>{p.qty}</TableCell>
                  <TableCell className={p.waitingHours > 4 ? "text-warning font-semibold" : ""}>{p.waitingHours}j</TableCell>
                  <TableCell className="text-xs">{p.assigned === "—" ? <Badge variant="outline">Unassigned</Badge> : p.assigned}</TableCell>
                  <TableCell><Badge className={priorityTone[p.priority]}>{p.priority}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {p.assigned === "—" && <Button size="sm" variant="ghost"><UserPlus className="h-4 w-4" /></Button>}
                      <Button size="sm" variant="soft">Beli</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
