import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { aiSettings, platformStats } from "@/lib/superadmin-mock";
import { Save, Brain, Activity } from "lucide-react";

export default function AISettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="AI Settings"
        description="Konfigurasi AI Personal Shopper, model, dan rate limit."
        action={<Button variant="hero" size="sm"><Save className="h-4 w-4" />Simpan</Button>}
      />
      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <Card className="border-border/60"><CardContent className="p-4">
          <div className="flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground">Model aktif</p></div>
          <p className="font-display text-lg font-bold mt-1">Gemini 2.5 Flash</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4">
          <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-success" /><p className="text-xs text-muted-foreground">Tokens MTD</p></div>
          <p className="font-display text-lg font-bold mt-1">{(platformStats.aiTokensMtd / 1000).toFixed(0)}K</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4">
          <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-accent" /><p className="text-xs text-muted-foreground">Avg response</p></div>
          <p className="font-display text-lg font-bold mt-1">1.2s</p>
        </CardContent></Card>
      </div>
      <div className="grid gap-3">
        {aiSettings.map((s) => (
          <Card key={s.key} className="border-border/60">
            <CardContent className="p-5">
              <div className="grid md:grid-cols-3 gap-4 items-center">
                <div>
                  <Label className="font-semibold">{s.key}</Label>
                  <p className="text-xs text-muted-foreground mt-1">{s.note}</p>
                </div>
                <Input defaultValue={s.value} className="md:col-span-2 font-mono text-sm" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
