import { Coins, Plus, Minus, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { customer, fmtRp } from "@/lib/customer-mock";

const ledger = [
  { id: 1, type: "earn", desc: "Order ORD-8762 selesai", amount: 482, date: "10 Apr 2026" },
  { id: 2, type: "spend", desc: "Diskon Q-1287 (Onitsuka)", amount: -1200, date: "18 Apr 2026" },
  { id: 3, type: "earn", desc: "Bonus referral @dimas_p", amount: 500, date: "05 Apr 2026" },
  { id: 4, type: "earn", desc: "Order ORD-8740 selesai", amount: 1890, date: "31 Mar 2026" },
  { id: 5, type: "earn", desc: "Bonus signup", amount: 1168, date: "01 Mar 2026" },
];

const Points = () => (
  <>
    <PageHeader eyebrow="Poin" title="Saldo & riwayat poin" description="1 poin = Rp 10. Tukar saat checkout untuk diskon." />

    <div className="grid md:grid-cols-3 gap-5 mb-6">
      <div className="md:col-span-2 rounded-3xl bg-gradient-coral text-primary-foreground p-8 shadow-glow relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_80%_30%,white,transparent_50%)]" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
            <Coins className="h-4 w-4" /> Saldo Poin
          </div>
          <p className="font-display text-5xl md:text-6xl font-bold mt-3">{customer.points.balance.toLocaleString("id-ID")}</p>
          <p className="text-sm opacity-90 mt-2">Senilai {fmtRp(customer.points.rupiahValue)} · expired {customer.points.expires}</p>
          <Button size="sm" className="bg-background text-foreground hover:bg-background/90 mt-5">
            Tukar Poin <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
        <h3 className="font-display font-bold mb-3">Cara dapat poin</h3>
        <ul className="space-y-2.5 text-sm text-muted-foreground">
          <li>✨ Setiap order selesai (1% nilai order)</li>
          <li>🎁 Bonus signup 1.000 pts</li>
          <li>👥 Referral teman 500 pts</li>
          <li>📅 Login harian (7 hari) 100 pts</li>
        </ul>
      </div>
    </div>

    <div className="rounded-3xl bg-card border border-border/40 shadow-soft overflow-hidden">
      <div className="px-6 py-4 border-b border-border/60">
        <h2 className="font-display font-bold">Riwayat poin</h2>
      </div>
      <div className="divide-y divide-border/40">
        {ledger.map((l) => (
          <div key={l.id} className="flex items-center gap-4 px-6 py-4">
            <div className={`h-10 w-10 rounded-2xl grid place-items-center shrink-0 ${l.type === "earn" ? "bg-success/15 text-success" : "bg-primary-soft text-primary"}`}>
              {l.type === "earn" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{l.desc}</p>
              <p className="text-xs text-muted-foreground">{l.date}</p>
            </div>
            <p className={`font-bold ${l.amount > 0 ? "text-success" : "text-primary"}`}>
              {l.amount > 0 ? "+" : ""}{l.amount.toLocaleString("id-ID")} pts
            </p>
          </div>
        ))}
      </div>
    </div>
  </>
);

export default Points;
