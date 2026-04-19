import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { feeSettings } from "@/lib/superadmin-mock";
import { Save } from "lucide-react";

export default function Fees() {
  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Fee Settings"
        description="Konfigurasi kurs, payment gateway, asuransi, customs, dan storage."
        action={<Button variant="hero" size="sm"><Save className="h-4 w-4" />Simpan semua</Button>}
      />
      <div className="grid gap-3">
        {feeSettings.map((s) => (
          <Card key={s.key} className="border-border/60">
            <CardContent className="p-5">
              <div className="grid md:grid-cols-3 gap-4 items-center">
                <div>
                  <Label className="font-semibold">{s.key}</Label>
                  <p className="text-xs text-muted-foreground mt-1">{s.note}</p>
                </div>
                <Input defaultValue={s.value} className="md:col-span-2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
