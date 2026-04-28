import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useShippingRoutes } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { Edit3, Plus, Truck } from "lucide-react";

export default function Shipping() {
  const { data: routes = [], isLoading, error } = useShippingRoutes();

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Shipping Rules"
        description="Rute pengiriman, harga per kg, ETA, dan minimum berat."
        action={<Button variant="hero" size="sm"><Plus className="h-4 w-4" />Tambah rute</Button>}
      />
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 text-sm text-muted-foreground">Memuat shipping routes...</div>
          ) : error ? (
            <div className="p-5 text-sm text-destructive">Gagal memuat shipping routes.</div>
          ) : routes.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Belum ada shipping route.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rute</TableHead>
                  <TableHead>Per kg</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Min weight</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium flex items-center gap-2"><Truck className="h-4 w-4 text-primary" />{r.route}</TableCell>
                    <TableCell className="font-semibold">{fmtRp(r.price_per_kg)}</TableCell>
                    <TableCell className="text-xs">{r.eta || "—"}</TableCell>
                    <TableCell className="text-xs">{r.min_weight || "—"}</TableCell>
                    <TableCell><Switch defaultChecked={r.active} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost"><Edit3 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
