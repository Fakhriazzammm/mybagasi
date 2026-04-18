import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const tiers = [
  {
    name: "Free", price: "Rp 0", period: "selamanya",
    features: ["Quotation unlimited", "Order tracking", "Akses WhatsApp bot", "Komunitas"],
    cta: "Mulai Gratis", variant: "outline" as const,
  },
  {
    name: "Plus", price: "Rp 49rb", period: "/bulan", popular: true,
    features: ["Semua di Free", "Diskon fee jasa 15%", "Price alert prioritas", "Batch shipping otomatis", "Customer support priority"],
    cta: "Coba 14 Hari", variant: "hero" as const,
  },
  {
    name: "Pro", price: "Rp 149rb", period: "/bulan",
    features: ["Semua di Plus", "Diskon fee jasa 30%", "Pre-order limited release", "Personal shopper khusus", "Reseller dashboard"],
    cta: "Upgrade Pro", variant: "teal" as const,
  },
];

export const Membership = () => (
  <section id="membership" className="container mx-auto py-20 md:py-28">
    <div className="text-center max-w-2xl mx-auto mb-14">
      <span className="text-xs uppercase tracking-widest text-accent font-semibold">Membership</span>
      <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4">Pilih paket yang pas.</h2>
      <p className="text-muted-foreground">Makin sering belanja, makin worth it. Bisa upgrade kapan saja.</p>
    </div>
    <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
      {tiers.map((t) => (
        <div
          key={t.name}
          className={`relative rounded-3xl p-8 border ${
            t.popular ? "bg-card border-primary/40 shadow-glow scale-[1.02]" : "bg-card border-border/40 shadow-soft"
          }`}
        >
          {t.popular && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-coral text-primary-foreground text-xs font-semibold shadow-soft">
              Paling Populer
            </span>
          )}
          <h3 className="font-display font-bold text-2xl">{t.name}</h3>
          <div className="mt-3 mb-5 flex items-baseline gap-1">
            <span className="font-display text-4xl font-bold">{t.price}</span>
            <span className="text-sm text-muted-foreground">{t.period}</span>
          </div>
          <ul className="space-y-3 mb-7">
            {t.features.map((f) => (
              <li key={f} className="flex gap-2.5 text-sm">
                <Check className="h-5 w-5 text-success shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Button variant={t.variant} className="w-full">{t.cta}</Button>
        </div>
      ))}
    </div>
  </section>
);
