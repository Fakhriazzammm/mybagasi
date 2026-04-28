import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useProcurementQueue } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { ShoppingCart, UserPlus } from "lucide-react";

const priorityTone: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  normal: "bg-primary-soft text-primary",
  low: "bg-muted text-muted-foreground",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "<1j";
  if (h < 24) return `${h}j`;
  return `${Math.floor(h / 24)}h`;
}

export default function Procurement() {
  const { data: procurementQueue = [], isLoading, error } = useProcurementQueue();

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
  if (!procurementQueue.length) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Belum ada data</p>
    </div>
  );

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
          { label: "Belum di-assign", value: procurementQueue.filter(p => !p.assigned_to).length, tone: "text-warning" },
          { label: "Rata-rata wait", value: Math.round(procurementQueue.reduce((s, p) => s + (Date.now() - new Date(p.created_at).getTime()) / 3600000, 0) / procurementQueue.length) + "j" },
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
              {procurementQueue.map((p: any) => {
                const waitH = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 3600000);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id}</TableCell>
                    <TableCell className="font-medium">{p.profiles?.name || "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{p.product}</TableCell>
                    <TableCell className="text-xs">{p.source}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtRp(p.price_jpy)}</TableCell>
                    <TableCell>{p.qty}</TableCell>
                    <TableCell className={waitH > 4 ? "text-warning font-semibold" : ""}>{timeAgo(p.created_at)}</TableCell>
                    <TableCell className="text-xs">{p.assigned_to ? <Badge variant="outline">{p.assigned_to.slice(0, 8)}</Badge> : <Badge variant="outline">Unassigned</Badge>}</TableCell>
                    <TableCell><Badge className={priorityTone[p.priority] || priorityTone.normal}>{p.priority}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!p.assigned_to && <Button size="sm" variant="ghost"><UserPlus className="h-4 w-4" /></Button>}
                        <Button size="sm" variant="soft">Beli</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
