import { Link } from "react-router-dom";
import { MessageCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const CTA = () => (
  <section className="container mx-auto py-20">
    <div className="rounded-[2.5rem] bg-gradient-coral text-primary-foreground p-10 md:p-16 text-center shadow-glow relative overflow-hidden">
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,white,transparent_40%)]" />
      <div className="relative max-w-2xl mx-auto space-y-6">
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">
          Siap belanja dari Jepang hari ini?
        </h2>
        <p className="opacity-90">Mulai gratis. Cukup chat WhatsApp, AI kami siap bantu 24/7.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="xl" className="bg-background text-foreground hover:bg-background/90" asChild>
            <Link to="/quotation"><MessageCircle className="h-5 w-5" /> Mulai via WhatsApp</Link>
          </Button>
          <Button variant="outline" size="xl" className="border-background/40 bg-transparent text-primary-foreground hover:bg-background/10" asChild>
            <Link to="/quotation">Cek Estimasi <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    </div>
  </section>
);
