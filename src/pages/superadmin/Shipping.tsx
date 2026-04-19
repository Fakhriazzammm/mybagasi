import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { shippingRules, fmtRp } from "@/lib/superadmin-mock";
import { Edit3, Plus, Truck } from "lucide-react";

export default function Shipping() {
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Rute</TableHead>
                <TableHead>Per kg</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Min weight</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shippingRules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.id}</TableCell>
                  <TableCell className="font-medium flex items-center gap-2"><Truck className="h-4 w-4 text-primary" />{r.route}</TableCell>
                  <TableCell className="font-semibold">{fmtRp(r.pricePerKg)}</TableCell>
                  <TableCell className="text-xs">{r.eta}</TableCell>
                  <TableCell className="text-xs">{r.minWeight}</TableCell>
                  <TableCell><Switch defaultChecked={r.active} /></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost"><Edit3 className="h-4 w-4" /></Button>
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
