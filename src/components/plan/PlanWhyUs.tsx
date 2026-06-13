import { Bot, TrendingDown, ShieldCheck, Sparkles, Bell, Calendar } from "lucide-react";

const mainBenefits = [
  {
    icon: Bot,
    title: "AI Respon 24/7",
    desc: "Nggak perlu nunggu admin balas. Kirim kapan pun, AI langsung proses — rata-rata respon di bawah 30 detik.",
    stat: "< 30 detik",
    statLabel: "respon rata-rata",
  },
  {
    icon: TrendingDown,
    title: "Ongkir Hemat hingga 50%",
    desc: "Gabung pengiriman batch sama user lain. Ongkir per kg jadi jauh lebih murah daripada kirim sendiri.",
    stat: "−50%",
    statLabel: "rata-rata hemat ongkir",
  },
  {
    icon: ShieldCheck,
    title: "Harga Transparan & Aman",
    desc: "Semua biaya dihitung upfront. Foto bukti pembelian dikirim sebelum barang dikirim ke kamu.",
    stat: "100%",
    statLabel: "tanpa biaya tersembunyi",
  },
];

const extraPerks = [
  { icon: Sparkles, label: "Poin & Membership — makin sering belanja, makin hemat" },
  { icon: Bell, label: "Price Alert — pantau harga, kabarin pas turun" },
  { icon: Calendar, label: "Pre-order — booking limited release Jepang sebelum sold-out" },
];

export const PlanWhyUs = () => (
  <section className="bg-secondary/40 py-20 md:py-28">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-xs uppercase tracking-widest text-accent font-semibold">
          Kenapa MyBagasi
        </span>
        <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4">
          Bukan jastip biasa.
        </h2>
        <p className="text-muted-foreground">
          Dibuat buat pecinta Jepang yang butuh cepat, hemat, dan gak mau ribet.
        </p>
      </div>

      {/* 3 main benefits */}
      <div className="grid gap-5 md:grid-cols-3 max-w-5xl mx-auto mb-10">
        {mainBenefits.map((b) => (
          <div
            key={b.title}
            className="rounded-3xl bg-card p-7 shadow-card border border-border/40 hover:shadow-lg hover:border-primary/30 transition-all"
          >
            <div className="h-12 w-12 rounded-2xl bg-gradient-warm grid place-items-center text-primary mb-4">
              <b.icon className="h-6 w-6" />
            </div>
            <div className="mb-4">
              <span className="font-display text-2xl font-bold text-primary">{b.stat}</span>
              <span className="block text-xs text-muted-foreground">{b.statLabel}</span>
            </div>
            <h3 className="font-display font-bold text-lg mb-1.5">{b.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
          </div>
        ))}
      </div>

      {/* Extra perks inline */}
      <div className="max-w-2xl mx-auto space-y-2.5">
        {extraPerks.map((p) => (
          <div key={p.label} className="flex items-center gap-3 text-sm text-muted-foreground bg-card/50 rounded-xl px-4 py-3 border border-border/30">
            <p.icon className="h-4 w-4 text-primary shrink-0" />
            <span>{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
);
