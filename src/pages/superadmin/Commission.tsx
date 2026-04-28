import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useAffiliateCommissionTiers } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { Edit3, Plus, Share2 } from "lucide-react";

export default function Commission() {
  const { data: tiers = [], isLoading, error } = useAffiliateCommissionTiers();

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Referral Commission"
        description="Tier komisi affiliate berdasarkan jumlah order yang dirujuk."
        action={<Button variant="hero" size="sm"><Plus className="h-4 w-4" />Tambah tier</Button>}
      />
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 text-sm text-muted-foreground">Memuat commission tiers...</div>
          ) : error ? (
            <div className="p-5 text-sm text-destructive">Gagal memuat commission tiers.</div>
          ) : tiers.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Belum ada commission tier.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead>Min orders</TableHead>
                  <TableHead>Komisi</TableHead>
                  <TableHead>Min payout</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium flex items-center gap-2"><Share2 className="h-4 w-4 text-primary" />{t.tier}</TableCell>
                    <TableCell>{t.min_orders}+</TableCell>
                    <TableCell className="font-semibold text-primary">{t.commission_percent}%</TableCell>
                    <TableCell className="font-semibold">{fmtRp(t.payout_min)}</TableCell>
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
