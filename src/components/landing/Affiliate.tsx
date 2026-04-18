import { TrendingUp, Wallet, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Affiliate = () => (
  <section className="container mx-auto py-20 md:py-28">
    <div className="rounded-[2.5rem] overflow-hidden bg-gradient-teal text-accent-foreground p-10 md:p-16 relative">
      <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
      <div className="absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
      <div className="relative grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <span className="text-xs uppercase tracking-widest opacity-80 font-semibold">Affiliate & Creator</span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4 leading-tight">
            Konten kamu bisa jadi cuan.
          </h2>
          <p className="opacity-90 mb-7 max-w-md">
            Share link MyBagasi ke followers. Dapat komisi setiap order yang berhasil — dibayar tiap bulan.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="default" size="lg" className="bg-background text-foreground hover:bg-background/90">
              Daftar Creator
            </Button>
            <Button variant="outline" size="lg" className="border-background/40 text-accent-foreground bg-transparent hover:bg-background/10">
              Pelajari
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: TrendingUp, label: "Komisi", value: "5–12%" },
            { icon: Wallet, label: "Min payout", value: "Rp 100rb" },
            { icon: Share2, label: "Tools", value: "Link & QR" },
            { icon: TrendingUp, label: "Top creator", value: "Rp 18jt/bln" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-background/15 backdrop-blur p-5 border border-background/20">
              <s.icon className="h-5 w-5 mb-3 opacity-80" />
              <p className="text-xs uppercase tracking-wider opacity-70">{s.label}</p>
              <p className="font-display font-bold text-2xl">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);
