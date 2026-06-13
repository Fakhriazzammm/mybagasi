import { MessageCircle, Calculator, PackageCheck } from "lucide-react";

const steps = [
  {
    icon: MessageCircle,
    title: "Kirim Link atau Foto",
    desc: "Paste link Mercari/Rakuten/Amazon JP, kirim screenshot, atau cukup bilang apa yang kamu mau.",
  },
  {
    icon: Calculator,
    title: "AI Hitung Total All-in",
    desc: "Harga produk + ongkir + pajak — langsung tau totalnya dalam detik. No hidden fee.",
  },
  {
    icon: PackageCheck,
    title: "Bayar & Barang Sampai",
    desc: "Transfer/VA/e-wallet. Kami beli, kirim ke gudang Tokyo, terus antar sampai rumah kamu.",
  },
];

export const PlanHowItWorks = () => (
  <section className="container mx-auto py-20 md:py-28 px-4">
    <div className="text-center max-w-2xl mx-auto mb-14">
      <span className="text-xs uppercase tracking-widest text-primary font-semibold">
        Cara Kerja
      </span>
      <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4">
        Dari chat sampai depan pintu.
      </h2>
      <p className="text-muted-foreground">
        3 langkah simpel. Tanpa ribet kartu kredit luar atau jastip yang slow respon.
      </p>
    </div>

    <div className="grid gap-5 md:grid-cols-3 max-w-4xl mx-auto">
      {steps.map((s, i) => (
        <div
          key={s.title}
          className="relative rounded-3xl bg-card p-7 shadow-card border border-border/40 hover:-translate-y-1 transition-transform"
        >
          <div className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-gradient-coral text-primary-foreground grid place-items-center text-xs font-bold shadow-soft">
            {i + 1}
          </div>
          <div className="h-12 w-12 rounded-2xl bg-primary-soft grid place-items-center text-primary mb-4">
            <s.icon className="h-6 w-6" />
          </div>
          <h3 className="font-display font-bold text-lg mb-1.5">{s.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
        </div>
      ))}
    </div>
  </section>
);
