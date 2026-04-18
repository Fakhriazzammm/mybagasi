import { MessageCircle, Calculator, CreditCard, Plane, Home } from "lucide-react";

const steps = [
  { icon: MessageCircle, title: "Chat WhatsApp", desc: "Kirim link produk, foto, atau cukup bilang apa yang kamu mau." },
  { icon: Calculator, title: "Quotation Otomatis", desc: "AI kami hitung harga, ongkir, pajak — total all-in dalam detik." },
  { icon: CreditCard, title: "Bayar Aman", desc: "Transfer / VA / e-wallet. Setelah lunas, kami langsung beli." },
  { icon: Plane, title: "Diproses & Dikirim", desc: "Barang masuk gudang Tokyo, lalu dikirim ke Indonesia." },
  { icon: Home, title: "Sampai Rumah", desc: "Kurir last-mile antar ke alamat kamu. Lacak realtime." },
];

export const HowItWorks = () => (
  <section className="container mx-auto py-20 md:py-28">
    <div className="text-center max-w-2xl mx-auto mb-14">
      <span className="text-xs uppercase tracking-widest text-primary font-semibold">Cara Kerja</span>
      <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4">
        Dari chat sampai depan pintu rumah.
      </h2>
      <p className="text-muted-foreground">5 langkah simpel. Tanpa ribet kartu kredit luar atau jasa titip yang lambat balasnya.</p>
    </div>
    <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-5">
      {steps.map((s, i) => (
        <div
          key={s.title}
          className="relative rounded-3xl bg-card p-6 shadow-card border border-border/40 hover:-translate-y-1 transition-transform"
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
