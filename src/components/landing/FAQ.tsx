import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useLandingFAQs } from "@/hooks/useLandingContent";

export const FAQ = () => {
  const { data: faqs = [], isLoading, error } = useLandingFAQs();
  const items = faqs.map((f: any) => ({ q: f.question, a: f.answer }));

  return (
    <section id="faq" className="bg-secondary/40 py-20 md:py-28">
      <div className="container mx-auto max-w-3xl">
        <div className="text-center mb-12">
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">FAQ</span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3">Pertanyaan yang sering ditanya.</h2>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-card border border-border/40 animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="rounded-3xl bg-card border border-destructive/30 p-8 text-center text-destructive">
            FAQ gagal dimuat dari database.
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl bg-card border border-border/40 p-8 text-center text-muted-foreground">
            Belum ada FAQ aktif di database.
          </div>
        ) : (
          <Accordion type="single" collapsible className="space-y-3">
            {items.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="rounded-2xl bg-card border border-border/40 px-6 shadow-soft">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </section>
  );
};
