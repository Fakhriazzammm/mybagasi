import { Star } from "lucide-react";

const items = [
  { name: "Rina A.", city: "Jakarta", text: "Cuma kirim link Mercari, 10 menit dapat quote. Sneakers sampai cuma 9 hari!", rating: 5 },
  { name: "Dimas P.", city: "Bandung", text: "Suka banget AI shopper-nya. Dia carikan figure langka padahal aku cuma kasih foto.", rating: 5 },
  { name: "Citra L.", city: "Surabaya", text: "Batch shipping ngebantu banget. Hemat 40% ongkir, barang aman semua.", rating: 5 },
];

export const Testimonials = () => (
  <section className="bg-gradient-warm py-20 md:py-28">
    <div className="container mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Testimoni</span>
        <h2 className="font-display text-3xl md:text-5xl font-bold mt-3">Dipercaya 12.000+ pembeli.</h2>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {items.map((t) => (
          <div key={t.name} className="rounded-3xl bg-card p-7 shadow-card border border-border/40">
            <div className="flex gap-0.5 mb-4">
              {Array.from({ length: t.rating }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-warning text-warning" />
              ))}
            </div>
            <p className="text-foreground/90 leading-relaxed mb-5">"{t.text}"</p>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-coral grid place-items-center text-primary-foreground font-bold">
                {t.name[0]}
              </div>
              <div>
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.city}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);
