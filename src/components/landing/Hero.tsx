import { Link } from "react-router-dom";
import { ArrowRight, MessageCircle, Sparkles, ShieldCheck, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero-mybagasi.jpg";

export const Hero = () => (
  <section className="relative overflow-hidden bg-gradient-hero">
    <div className="absolute inset-0 -z-10 opacity-60">
      <div className="absolute top-20 -left-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
    </div>
    <div className="container mx-auto py-16 md:py-24 grid lg:grid-cols-2 gap-12 items-center">
      <div className="space-y-6 animate-fade-up">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur border border-border/60 text-xs font-medium shadow-soft">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI Personal Shopper Jepang #1 di WhatsApp
        </span>
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05]">
          Belanja barang Jepang
          <br />
          <span className="text-primary">
            cukup chat WhatsApp.
          </span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl">
          Kirim link, foto, atau cukup bilang <span className="font-semibold text-foreground">"belikan sepatu ini dari Jepang"</span>. AI kami akan cari, hitung total all-in, dan antar sampai rumah kamu.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="hero" size="xl" asChild>
            <Link to="/quotation">
              <Sparkles className="h-5 w-5" />
              Coba AI Shopper
            </Link>
          </Button>
          <Button variant="outline" size="xl" asChild>
            <a
              href="https://wa.me/6281234567890?text=Halo%20MyBagasi%2C%20saya%20mau%20belanja%20dari%20Jepang"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="h-5 w-5" />
              Chat WhatsApp
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
        <div className="flex flex-wrap gap-5 pt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-success" /> Garansi barang asli</span>
          <span className="inline-flex items-center gap-1.5"><Plane className="h-4 w-4 text-accent" /> Pengiriman 7–14 hari</span>
          <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Tanpa biaya tersembunyi</span>
        </div>
      </div>

      <div className="relative">
        <div className="absolute -inset-4 bg-gradient-coral opacity-20 blur-3xl rounded-[3rem]" />
        <div className="relative rounded-[2.5rem] overflow-hidden shadow-card border-8 border-background bg-background">
          <img
            src={heroImg}
            alt="Ilustrasi MyBagasi belanja dari Jepang"
            width={1280}
            height={960}
            className="w-full h-auto"
          />
        </div>
        {/* floating chat bubble */}
        <div className="absolute -bottom-6 -left-4 md:-left-10 rounded-2xl bg-background shadow-card p-3 pr-4 flex items-center gap-3 max-w-[260px] animate-float">
          <div className="h-10 w-10 rounded-full bg-success/15 grid place-items-center text-success">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="text-xs">
            <p className="font-semibold">Kak, ini total all-in:</p>
            <p className="text-muted-foreground">Rp 1.842.000 — siap proses?</p>
          </div>
        </div>
        <div className="absolute -top-4 -right-2 md:-right-8 rounded-2xl bg-background shadow-card px-4 py-3 animate-float" style={{ animationDelay: "1s" }}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Hemat ongkir</p>
          <p className="font-display font-bold text-xl text-accent">−42%</p>
          <p className="text-[10px] text-muted-foreground">via Batch Shipping</p>
        </div>
      </div>
    </div>
  </section>
);
