import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { pricingRules, fmtRp } from "@/lib/superadmin-mock";
import { Edit3, Plus } from "lucide-react";

export default function Pricing() {
  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Pricing Rules"
        description="Aturan service fee dan markup pada quotation engine."
        action={<Button variant="hero" size="sm"><Plus className="h-4 w-4" />Tambah rule</Button>}
      />
      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Apply ke</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricingRules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.id}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
                  <TableCell className="font-mono font-semibold">
                    {r.type === "percent" ? `${r.value}%` : fmtRp(r.value)}
                  </TableCell>
                  <TableCell className="text-xs">{r.applyTo}</TableCell>
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
