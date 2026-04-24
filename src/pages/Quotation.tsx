import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Bell, Bookmark, ShoppingBag, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { generateSmartQuotation, type SmartQuotationResult } from "@/lib/quotation-assistant";
import { useCreateSmartQuotation } from "@/hooks/useQuotations";

const schema = z
  .object({
    url: z.string().trim().max(500).optional().or(z.literal("")),
    query: z.string().trim().max(200).optional().or(z.literal("")),
    budget: z.string().trim().max(20).optional().or(z.literal("")),
  })
  .refine((d) => d.url || d.query, { message: "Isi link atau nama produk", path: ["query"] });

type FormData = z.infer<typeof schema>;

const fmt = (n: number) => "Rp " + n.toLocaleString("id-ID");
const fmtJpy = (n: number) => "JPY " + n.toLocaleString("ja-JP");

const confidenceTone = (label: SmartQuotationResult["confidenceLabel"]) => {
  if (label === "High") return "bg-success/15 text-success";
  if (label === "Medium") return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
};

const Quotation = () => {
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<SmartQuotationResult | null>(null);
  const [savedQuotationId, setSavedQuotationId] = useState<string | null>(null);
  const createSmartQuotation = useCreateSmartQuotation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { url: "", query: "", budget: "" },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setQuote(null);
    setSavedQuotationId(null);

    try {
      const result = await generateSmartQuotation(data);
      setQuote(result);

      const total =
        result.productJpy * result.rate +
        result.fee +
        result.shipping +
        result.tax -
        result.membershipDiscount -
        result.pointsUsed;

      try {
        const saved = await createSmartQuotation.mutateAsync({
          quotationPayload: {
            product: result.product,
            url: result.sourceUrl,
            source: result.marketplace,
            price_jpy: result.productJpy,
            exchange_rate: result.rate,
            service_fee: result.fee,
            shipping_cost: result.shipping,
            tax_customs: result.tax,
            membership_discount: result.membershipDiscount,
            points_used: result.pointsUsed,
            total,
            confidence_score: result.confidenceScore,
            confidence_label: result.confidenceLabel,
            price_history: result.priceHistory as Record<string, unknown>,
            assistant_summary: {
              similarCount: result.similarCount,
              reasons: result.confidenceReasons,
            },
          },
          auditPayload: {
            input_url: data.url || undefined,
            input_query: data.query || undefined,
            input_budget: data.budget || undefined,
            confidence_score: result.confidenceScore,
            confidence_label: result.confidenceLabel,
            confidence_reasons: result.confidenceReasons,
            price_history: result.priceHistory as Record<string, unknown>,
            similar_count: result.similarCount,
            estimation_payload: result as unknown as Record<string, unknown>,
          },
        });

        setSavedQuotationId(saved.quotation.id);
        toast.success("Smart quotation tersimpan", {
          description: `Confidence ${result.confidenceScore}% (${result.confidenceLabel})`,
        });
      } catch (saveError) {
        const isAuthError =
          saveError instanceof Error &&
          (saveError.message.toLowerCase().includes("not authenticated") ||
            saveError.message.toLowerCase().includes("jwt") ||
            saveError.message.toLowerCase().includes("row-level"));

        toast.warning(
          isAuthError
            ? "Quotation dihitung, tapi belum tersimpan (perlu login)."
            : "Quotation dihitung, tetapi audit confidence belum tersimpan.",
        );
      }
    } catch (error) {
      toast.error("Gagal membuat quotation", {
        description: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga.",
      });
    } finally {
      setLoading(false);
    }
  };

  const total = quote
    ? quote.productJpy * quote.rate + quote.fee + quote.shipping + quote.tax - quote.membershipDiscount - quote.pointsUsed
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-10 md:py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">Smart Quotation Assistant</span>
            <h1 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-3">Hitung total all-in pakai data real marketplace.</h1>
            <p className="text-muted-foreground">Tempel link Mercari/Rakuten/Amazon JP atau ketik nama produk. Sistem akan tarik histori harga dan beri confidence score.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <form onSubmit={handleSubmit(onSubmit)} className="rounded-3xl bg-card p-7 shadow-card border border-border/40 space-y-5 h-fit">
              <div className="space-y-2">
                <Label htmlFor="url">Link produk Jepang</Label>
                <Input id="url" placeholder="https://mercari.com/items/..." {...register("url")} />
              </div>
              <div className="relative text-center">
                <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                <span className="relative inline-block px-3 bg-card text-xs text-muted-foreground">atau</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="query">Nama produk / kategori</Label>
                <Input id="query" placeholder="Onitsuka Tiger Mexico 66 size 42" {...register("query")} />
                {errors.query && <p className="text-xs text-destructive">{errors.query.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget">Budget (opsional)</Label>
                <Input id="budget" placeholder="Rp 1.500.000" {...register("budget")} />
              </div>
              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Menganalisis harga...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Hitung Smart Estimate
                  </>
                )}
              </Button>
            </form>

            <div className="rounded-3xl bg-gradient-warm p-7 shadow-card border border-border/40 min-h-[460px] flex flex-col">
              {!quote && !loading && (
                <div className="m-auto text-center text-muted-foreground space-y-3">
                  <div className="h-16 w-16 mx-auto rounded-2xl bg-background/60 grid place-items-center">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <p className="text-sm">Hasil quotation kamu akan muncul di sini.</p>
                </div>
              )}

              {loading && (
                <div className="m-auto text-center space-y-3">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">AI sedang membaca produk dan histori harga...</p>
                </div>
              )}

              {quote && (
                <>
                  <div className="flex items-start gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
                      <ShoppingBag className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Quotation Smart</p>
                      <p className="font-semibold truncate">{quote.product}</p>
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-secondary text-foreground font-semibold">{quote.marketplace}</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${confidenceTone(quote.confidenceLabel)}`}>
                          Confidence {quote.confidenceScore}% ({quote.confidenceLabel})
                        </span>
                        {savedQuotationId && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-semibold">
                            Saved #{savedQuotationId.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background/70 p-3 mb-4">
                    <p className="text-xs font-semibold mb-1">Histori harga pembanding</p>
                    <p className="text-xs text-muted-foreground">
                      {quote.priceHistory.samples} sampel | Min {fmtJpy(quote.priceHistory.minJpy)} | Rata-rata {fmtJpy(quote.priceHistory.avgJpy)} | Max {fmtJpy(quote.priceHistory.maxJpy)}
                    </p>
                    {quote.confidenceReasons.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-2">{quote.confidenceReasons[0]}</p>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    {[
                      ["Harga produk", `${fmtJpy(quote.productJpy)} | ${fmt(quote.productJpy * quote.rate)}`],
                      ["Kurs JPY -> IDR", `Rp ${quote.rate.toLocaleString("id-ID")}`],
                      ["Fee jasa", fmt(quote.fee)],
                      ["Ongkir Jepang -> Indonesia", fmt(quote.shipping)],
                      ["Pajak dan bea", fmt(quote.tax)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-muted-foreground">
                        <span>{k}</span>
                        <span className="text-foreground font-medium">{v}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-success">
                      <span>Diskon membership</span>
                      <span className="font-medium">-{fmt(quote.membershipDiscount)}</span>
                    </div>
                    <div className="flex justify-between text-success">
                      <span>Poin terpakai</span>
                      <span className="font-medium">-{fmt(quote.pointsUsed)}</span>
                    </div>
                  </div>

                  <div className="mt-5 pt-5 border-t border-border/60 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Total all-in estimasi</p>
                      <p className="font-display text-3xl font-bold text-primary">{fmt(total)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground text-right">Data pembanding<br /><span className="font-semibold text-foreground">{quote.similarCount} listing</span></p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-5">
                    <Button variant="hero">Lanjut Beli <ArrowRight className="h-4 w-4" /></Button>
                    <Button variant="outline"><Bookmark className="h-4 w-4" /> Simpan</Button>
                    <Button variant="soft" size="sm"><Bell className="h-4 w-4" /> Pantau Harga</Button>
                    <Button variant="ghost" size="sm">Cari Alternatif</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Quotation;
