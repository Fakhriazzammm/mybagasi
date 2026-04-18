import { Sparkles, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";

const AIShopper = () => (
  <>
    <PageHeader
      eyebrow="AI Personal Shopper"
      title="Bingung pilih? Tanya AI."
      description="Cari produk Jepang berdasarkan budget, brand, ukuran, atau cuma deskripsi acak."
    />
    <div className="rounded-3xl bg-gradient-warm border border-border/40 p-12 text-center shadow-soft">
      <div className="h-16 w-16 mx-auto rounded-2xl bg-primary text-primary-foreground grid place-items-center mb-4 animate-float">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="font-display text-2xl font-bold mb-2">Coming soon di dashboard</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
        Sementara, kamu bisa pakai AI shopper kami langsung di simulasi WhatsApp.
      </p>
      <Button variant="hero" asChild>
        <Link to="/whatsapp-demo"><MessageCircle className="h-4 w-4" />Coba di WhatsApp</Link>
      </Button>
    </div>
  </>
);

export default AIShopper;
