import { Star } from "lucide-react";
import { useLandingTestimonials } from "@/hooks/useLandingContent";

export const Testimonials = () => {
  const { data: testimonials = [], isLoading, error } = useLandingTestimonials();

  const items = testimonials.map((t: any) => ({
    name: t.name,
    city: t.city || "",
    text: t.text,
    rating: t.rating || 5,
  }));

  return (
    <section className="bg-gradient-warm py-20 md:py-28">
      <div className="container mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">Testimoni</span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3">Dipercaya pelanggan setia.</h2>
        </div>
        {isLoading ? (
          <div className="grid gap-5 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-64 rounded-3xl bg-card border border-border/40 animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="rounded-3xl bg-card border border-destructive/30 p-8 text-center text-destructive">
            Testimoni gagal dimuat dari database.
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl bg-card border border-border/40 p-8 text-center text-muted-foreground">
            Belum ada testimoni aktif di database.
          </div>
        ) : (
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
        )}
      </div>
    </section>
  );
};
