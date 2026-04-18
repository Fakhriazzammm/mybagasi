import { Crown, Check } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { customer, fmtRp } from "@/lib/customer-mock";

const tiers = [
  { name: "Free", price: "Rp 0", current: false, features: ["Quotation unlimited", "Order tracking", "WhatsApp bot"] },
  { name: "Plus", price: "Rp 49rb/bulan", current: true, features: ["Diskon fee jasa 15%", "Price alert prioritas", "Batch shipping otomatis", "Priority support"] },
  { name: "Pro", price: "Rp 149rb/bulan", current: false, features: ["Diskon fee jasa 30%", "Pre-order limited release", "Personal shopper khusus", "Reseller dashboard"] },
];

const Membership = () => {
  const progress = Math.round((customer.membership.spent / customer.membership.target) * 100);
  return (
    <>
      <PageHeader eyebrow="Membership" title="Status & benefit kamu" />

      <div className="rounded-3xl bg-gradient-coral text-primary-foreground p-8 shadow-glow relative overflow-hidden mb-6">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_70%_20%,white,transparent_50%)]" />
        <div className="relative grid md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
              <Crown className="h-4 w-4" /> Tier aktif
            </div>
            <p className="font-display text-5xl font-bold mt-2">{customer.membership.tier}</p>
            <p className="text-sm opacity-80 mt-2">Berlaku sampai {customer.membership.renewsOn}</p>
          </div>
          <div>
            <div className="flex justify-between text-xs opacity-90 mb-2">
              <span>Menuju {customer.membership.nextTier}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-3 rounded-full bg-background/25 overflow-hidden">
              <div className="h-full bg-background rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-xs opacity-90 mt-2">
              <span>{fmtRp(customer.membership.spent)}</span>
              <span>{fmtRp(customer.membership.target)}</span>
            </div>
            <p className="text-xs opacity-80 mt-2">Belanja {fmtRp(customer.membership.target - customer.membership.spent)} lagi untuk upgrade gratis ke Pro.</p>
          </div>
        </div>
      </div>

      <h2 className="font-display text-lg font-bold mb-4">Pilih paket</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {tiers.map((t) => (
          <div key={t.name} className={`rounded-3xl p-6 border ${t.current ? "bg-card border-primary shadow-card" : "bg-card border-border/40 shadow-soft"}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-display text-2xl font-bold">{t.name}</p>
              {t.current && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold">AKTIF</span>}
            </div>
            <p className="text-sm text-muted-foreground mb-5">{t.price}</p>
            <ul className="space-y-2 mb-6 text-sm">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-success shrink-0 mt-0.5" /><span>{f}</span></li>
              ))}
            </ul>
            <Button variant={t.current ? "outline" : "hero"} className="w-full" disabled={t.current}>
              {t.current ? "Paket Sekarang" : `Upgrade ke ${t.name}`}
            </Button>
          </div>
        ))}
      </div>
    </>
  );
};

export default Membership;
