import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { supportNotes } from "@/lib/admin-mock";
import { MessageCircle, Mail, CheckCircle2 } from "lucide-react";

const statusTone: Record<string, string> = {
  open: "bg-destructive/15 text-destructive",
  in_progress: "bg-warning/15 text-warning",
  resolved: "bg-success/15 text-success",
};

const statusLabel: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export default function Support() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Customer Support Notes"
        description="Catatan interaksi customer support — semua channel masuk ke sini."
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {supportNotes.map((n) => (
            <Card key={n.id} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-primary-soft text-primary grid place-items-center shrink-0">
                    {n.channel === "WhatsApp" ? <MessageCircle className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{n.customer}</span>
                      {n.order !== "—" && <span className="font-mono text-[11px] text-muted-foreground">{n.order}</span>}
                      <Badge className={statusTone[n.status]}>{statusLabel[n.status]}</Badge>
                      <span className="text-[11px] text-muted-foreground ml-auto">{n.at}</span>
                    </div>
                    <p className="text-sm mt-2">{n.note}</p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
                      <span className="text-xs text-muted-foreground">Agent: <strong className="text-foreground">{n.agent}</strong></span>
                      {n.status !== "resolved" && (
                        <Button size="sm" variant="ghost"><CheckCircle2 className="h-4 w-4" />Resolve</Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/60 h-fit lg:sticky lg:top-20">
          <CardContent className="p-5">
            <h3 className="font-semibold mb-1">Tambah catatan</h3>
            <p className="text-xs text-muted-foreground mb-3">Tulis ringkasan interaksi terbaru.</p>
            <Textarea placeholder="Contoh: Customer minta perubahan alamat ke kantor…" className="min-h-[120px] rounded-2xl" />
            <Button variant="hero" className="w-full mt-3">Simpan catatan</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
