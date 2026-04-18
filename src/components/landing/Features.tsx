import { Bot, Bell, Users, Calendar, Coins, ShieldCheck } from "lucide-react";

const features = [
  { icon: Bot, title: "AI Personal Shopper", desc: "Bingung pilih? AI kami bantu cari berdasarkan budget, brand, ukuran, warna." },
  { icon: Bell, title: "Price Alert", desc: "Pantau target harga & stok. Kami kabari saat barang impian turun harga." },
  { icon: Users, title: "Batch Shipping", desc: "Gabung pengiriman bareng user lain, ongkir bisa hemat sampai 50%." },
  { icon: Calendar, title: "Pre-order", desc: "Booking limited release Jepang sebelum sold-out. DP atau full payment." },
  { icon: Coins, title: "Poin & Membership", desc: "Belanja dapat poin. Naik tier, makin banyak diskon & benefit." },
  { icon: ShieldCheck, title: "Transparan & Aman", desc: "Tanpa biaya tersembunyi. Foto bukti pembelian sebelum dikirim." },
];

export const Features = () => (
  <section className="bg-secondary/40 py-20 md:py-28">
    <div className="container mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-xs uppercase tracking-widest text-accent font-semibold">Keunggulan</span>
        <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4">
          Bukan jastip biasa.
        </h2>
        <p className="text-muted-foreground">Dirancang untuk pecinta Jepang yang butuh cepat, hemat, dan terpercaya.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-3xl bg-card p-7 shadow-soft border border-border/40 hover:shadow-card hover:border-primary/30 transition-all">
            <div className="h-12 w-12 rounded-2xl bg-gradient-warm grid place-items-center text-primary mb-5">
              <f.icon className="h-6 w-6" />
            </div>
            <h3 className="font-display font-bold text-xl mb-2">{f.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
