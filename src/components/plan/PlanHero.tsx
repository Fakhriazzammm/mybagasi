import { Link } from "react-router-dom";
import { ArrowRight, MessageCircle, Sparkles, ShieldCheck, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PlanHero = () => (
  <section className="relative min-h-[90dvh] grid place-items-center overflow-hidden bg-gradient-hero">
    <div className="absolute inset-0 -z-10">
      <div className="absolute top-10 -left-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute bottom-20 right-0 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
    </div>

    <div className="container mx-auto px-4 py-12 md:py-20 text-center max-w-3xl space-y-6">
      {/* Badge */}
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur border border-border/60 text-xs font-medium shadow-soft">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI Personal Shopper Jepang #1 di Telegram
        </span>
      </div>

      {/* Headline */}
      <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05]">
        Belanja barang Jepang
        <br />
        <span className="text-primary">cukup chat Telegram.</span>
      </h1>

      {/* Subheadline */}
      <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
        Kirim link, foto, atau cukup bilang{" "}
        <span className="font-semibold text-foreground">
          "belikan sepatu ini dari Jepang"
        </span>
        . AI kami akan cari, hitung total all-in, dan antar sampai rumah kamu.
      </p>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
        <Button variant="hero" size="xl" asChild>
          <Link to="/aipersonalshopper">
            <Sparkles className="h-5 w-5" />
            Coba AI Shopper
          </Link>
        </Button>
        <Button variant="outline" size="xl" asChild>
          <a
            href="https://t.me/mybagasibot"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="h-5 w-5" />
            Chat Telegram
            <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
      </div>

      {/* Trust row */}
      <div className="flex flex-wrap gap-5 justify-center pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-success" /> Garansi barang asli
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Plane className="h-4 w-4 text-accent" /> Pengiriman 7–14 hari
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" /> Tanpa biaya tersembunyi
        </span>
      </div>
    </div>
  </section>
);
