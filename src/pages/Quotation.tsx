import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { scrapeProduct, searchProducts, type ProductData } from "@/lib/scraper";
import { estimateAllInFromJPY } from "@/lib/ai";
import { fmtRp, fmtJpy } from "@/lib/format";
import { appConfig } from "@/lib/runtime-config";
import { quotationsService } from "@/services/quotations.service";
import { wishlistService, priceAlertsService } from "@/services/wishlist.service";
import { ordersService } from "@/services/orders.service";

const schema = z.object({
  url: z.string().trim().max(500).optional().or(z.literal("")),
  query: z.string().trim().max(200).optional().or(z.literal("")),
  budget: z.string().trim().max(20).optional().or(z.literal("")),
}).refine((d) => d.url || d.query, { message: "Isi link atau nama produk", path: ["query"] });

type FormData = z.infer<typeof schema>;

type Quote = {
  product: string;
  productJpy: number;
  rate: number;
  fee: number;
  shipping: number;
  tax: number;
  membershipDiscount: number;
  pointsUsed: number;
  source?: string;
};

const JPY_TO_IDR = appConfig.pricing.jpyToIdr;
const SERVICE_FEE_RATE = appConfig.pricing.serviceFeeRate;
const SHIPPING_IDR = appConfig.pricing.shippingIdr;
const TAX_RATE = appConfig.pricing.taxRate;

const Quotation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotationId, setQuotationId] = useState<string | null>(null);
  const [quoteUrl, setQuoteUrl] = useState(searchParams.get("url") ?? "");
  const [searchResults, setSearchResults] = useState<ProductData[]>([]);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { url: "", query: "", budget: "" },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setQuote(null);
    setQuotationId(null);
    setSearchResults([]);
    setScrapeError(null);

    try {
      // Priority: URL scrape
      if (data.url) {
        const scraped = await scrapeProduct(data.url);
        const productJpy = scraped.price_jpy ?? 0;
        const productName = scraped.title || "Produk dari " + scraped.marketplace;
        const source = scraped.marketplace;

        if (!productJpy || productJpy < 100) {
          throw new Error("Harga produk tidak terbaca dari link tersebut. Pastikan link valid dan produk masih tersedia.");
        }

        const estimate = estimateAllInFromJPY(productJpy);
        const productIdr = Math.round(productJpy * JPY_TO_IDR);

        const nextQuote = {
          product: productName,
          productJpy,
          rate: JPY_TO_IDR,
          fee: estimate.serviceFee,
          shipping: estimate.shipping,
          tax: estimate.tax,
          membershipDiscount: Math.round(productIdr * 0.03),
          pointsUsed: productJpy > 20000 ? 12000 : 5000,
          source,
        };
        setQuote(nextQuote);
        setQuoteUrl(data.url);
        const saved = await quotationsService.create({
          product: nextQuote.product, url: data.url, source: nextQuote.source, price_jpy: nextQuote.productJpy, exchange_rate: nextQuote.rate,
          service_fee: nextQuote.fee, shipping_cost: nextQuote.shipping, tax_customs: nextQuote.tax, membership_discount: nextQuote.membershipDiscount,
          points_used: nextQuote.pointsUsed, total: Math.max(0, (nextQuote.productJpy * nextQuote.rate) + nextQuote.fee + nextQuote.shipping + nextQuote.tax - nextQuote.membershipDiscount - nextQuote.pointsUsed),
        });
        setQuotationId(saved.id);
        toast.success("Quotation tersimpan real-time!");
      }
      // Fallback: keyword search via backend
      else if (data.query) {
        const results = await searchProducts({
          keyword: data.query,
          limit: 6,
        });

        if (!results || results.length === 0) {
          setScrapeError("Pencarian di marketplace Jepang belum menemukan produk. Coba kata kunci yang lebih spesifik, atau share langsung link produk yang diinginkan.");
        } else {
          setSearchResults(results);
          // Auto-pick first result for quotation display
          const first = results[0];
          const productJpy = first.price_jpy ?? 0;

          if (productJpy > 0) {
            const estimate = estimateAllInFromJPY(productJpy);
            const productIdr = Math.round(productJpy * JPY_TO_IDR);
            const nextQuote = {
              product: first.title || data.query,
              productJpy,
              rate: JPY_TO_IDR,
              fee: estimate.serviceFee,
              shipping: estimate.shipping,
              tax: estimate.tax,
              membershipDiscount: Math.round(productIdr * 0.03),
              pointsUsed: productJpy > 20000 ? 12000 : 5000,
              source: first.marketplace,
            };
            setQuote(nextQuote);
            setQuoteUrl(first.url ?? "");
            const saved = await quotationsService.create({
              product: nextQuote.product, url: first.url, source: nextQuote.source, price_jpy: nextQuote.productJpy, exchange_rate: nextQuote.rate,
              service_fee: nextQuote.fee, shipping_cost: nextQuote.shipping, tax_customs: nextQuote.tax, membership_discount: nextQuote.membershipDiscount,
              points_used: nextQuote.pointsUsed, total: Math.max(0, (nextQuote.productJpy * nextQuote.rate) + nextQuote.fee + nextQuote.shipping + nextQuote.tax - nextQuote.membershipDiscount - nextQuote.pointsUsed),
            });
            setQuotationId(saved.id);
          } else {
            // Product found but no price — show as result with note
            setQuote({
              product: first.title || data.query,
              productJpy: 0,
              rate: JPY_TO_IDR,
              fee: 0,
              shipping: SHIPPING_IDR,
              tax: 0,
              membershipDiscount: 0,
              pointsUsed: 0,
              source: first.marketplace,
            });
          }

          toast.success(`Ditemukan ${results.length} produk dari marketplace Jepang!`);
        }
      } else {
        throw new Error("Isi link produk atau nama produk.");
      }
    } catch (err: any) {
      const msg = err.message || "Gagal menghitung estimasi";
      setScrapeError(msg);
      toast.error("Gagal", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const total = quote
    ? Math.max(0, (quote.productJpy * quote.rate) + quote.fee + quote.shipping + quote.tax - quote.membershipDiscount - quote.pointsUsed)
    : 0;

  const productIdr = quote ? Math.round(quote.productJpy * quote.rate) : 0;

  const ensureQuote = () => {
    if (!quote) throw new Error("Quotation belum tersedia");
    return quote;
  };

  const continueBuy = async () => {
    const q = ensureQuote();
    setActionLoading("buy");
    try {
      const order = await ordersService.create({
        quotation_id: quotationId ?? undefined,
        product: q.product,
        source: q.source,
        price_jpy: q.productJpy,
        exchange_rate: q.rate,
        service_fee: q.fee,
        shipping_cost: q.shipping,
        tax_customs: q.tax,
        membership_discount: q.membershipDiscount,
        points_used: q.pointsUsed,
        total,
        notes: quoteUrl ? `Sumber quotation: ${quoteUrl}` : undefined,
      });
      if (quotationId) await quotationsService.markConverted(quotationId);
      toast.success("Order draft dibuat");
      navigate(`/checkout?order_id=${order.id}`);
    } catch (err: any) { toast.error("Gagal lanjut beli", { description: err.message }); }
    finally { setActionLoading(null); }
  };

  const saveWishlist = async () => {
    const q = ensureQuote();
    setActionLoading("wishlist");
    try {
      await wishlistService.add({ emoji: "🛍️", name: q.product, url: quoteUrl || null, price_idr: productIdr || total, source: q.source ?? null, note: quotationId ? `Quotation ${quotationId}` : "Dari halaman quotation" });
      toast.success("Tersimpan ke wishlist");
    } catch (err: any) { toast.error("Gagal simpan wishlist", { description: err.message }); }
    finally { setActionLoading(null); }
  };

  const watchPrice = async () => {
    const q = ensureQuote();
    const targetInput = window.prompt("Target harga IDR", String(Math.round((productIdr || total) * 0.9)));
    if (!targetInput) return;
    const target = Number(targetInput.replace(/[^0-9]/g, ""));
    if (!target) return toast.error("Target harga tidak valid");
    setActionLoading("alert");
    try {
      await priceAlertsService.create({ product: q.product, url: quoteUrl || null, current_price: productIdr || total, target_price: target });
      toast.success("Price alert aktif");
    } catch (err: any) { toast.error("Gagal membuat alert", { description: err.message }); }
    finally { setActionLoading(null); }
  };

  const findAlternative = async () => {
    const q = ensureQuote();
    setActionLoading("search");
    try {
      const results = await searchProducts({ keyword: q.product, limit: 6 });
      setSearchResults(results);
      toast.success(`${results.length} alternatif ditemukan`);
    } catch (err: any) { toast.error("Gagal mencari alternatif", { description: err.message }); }
    finally { setActionLoading(null); }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-10 md:py-16">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">Quotation Engine</span>
            <h1 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-3">
              Hitung total all-in dalam detik.
            </h1>
            <p className="text-muted-foreground">Tempel link Mercari/Rakuten/Amazon JP atau ketik nama produknya.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="rounded-3xl bg-card p-7 shadow-card border border-border/40 space-y-5 h-fit">
              <div className="space-y-2">
                <Label htmlFor="url">Link produk Jepang</Label>
                <Input id="url" placeholder="https://jp.mercari.com/item/..." defaultValue={searchParams.get("url") ?? ""} {...register("url")} />
              </div>
              <div className="relative text-center">
                <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                <span className="relative inline-block px-3 bg-card text-xs text-muted-foreground">atau</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="query">Nama produk / kata kunci</Label>
                <Input id="query" placeholder="Onitsuka Tiger Mexico 66 size 42" defaultValue={searchParams.get("query") ?? ""} {...register("query")} />
                {errors.query && <p className="text-xs text-destructive">{errors.query.message}</p>}
                <p className="text-[10px] text-muted-foreground">AI akan mencari di Mercari, Rakuten, Amazon JP, dan marketplace Jepang lainnya.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget">Budget (opsional)</Label>
                <Input id="budget" placeholder="Rp 1.500.000" {...register("budget")} />
              </div>
              {scrapeError && (
                <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                  {scrapeError}
                </div>
              )}
              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Mencari & menghitung...</> : <><Sparkles className="h-4 w-4" /> Hitung Estimasi</>}
              </Button>
            </form>

            {/* Result */}
            <div className="rounded-3xl bg-gradient-warm p-7 shadow-card border border-border/40 min-h-[400px] flex flex-col">
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
                  <p className="text-sm text-muted-foreground">AI sedang mencari di marketplace Jepang & hitung harga...</p>
                </div>
              )}
              {quote && (
                <>
                  <div className="flex items-start gap-3 mb-5">
                    <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
                      <ShoppingBag className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Quotation</p>
                      <p className="font-semibold truncate">{quote.product}</p>
                      {quote.source && <span className="text-[10px] text-muted-foreground">{quote.source}</span>}
                      {quote.productJpy > 0 && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-semibold">Active</span>
                      )}
                    </div>
                  </div>

                  {/* Search results comparison */}
                  {searchResults.length > 1 && (
                    <div className="mb-4 rounded-2xl bg-background/60 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Produk ditemukan</p>
                      <div className="max-h-32 overflow-y-auto space-y-1.5">
                        {searchResults.map((r, i) => (
                          <div key={i} className={`text-xs flex justify-between p-1.5 rounded-lg ${i === 0 ? "bg-primary/10 font-semibold" : "text-muted-foreground"}`}>
                            <span className="truncate mr-2">{r.title || r.marketplace}</span>
                            <span className="shrink-0">{r.price_jpy ? fmtJpy(r.price_jpy) : "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {quote.productJpy > 0 ? (
                    <>
                      <div className="space-y-2 text-sm">
                        {[
                          ["Harga produk", `${fmtJpy(quote.productJpy)} · ${fmtRp(productIdr)}`],
                          [`Kurs ${fmtJpy(1)} → IDR`, `Rp ${quote.rate}`],
                          [`Fee jasa MyBagasi (${(SERVICE_FEE_RATE * 100).toFixed(0)}%)`, fmtRp(quote.fee)],
                          ["Ongkir Jepang → Indo", fmtRp(quote.shipping)],
                          ["Pajak & bea cukai", fmtRp(quote.tax)],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between text-muted-foreground">
                            <span>{k}</span><span className="text-foreground font-medium">{v}</span>
                          </div>
                        ))}
                        {quote.membershipDiscount > 0 && (
                          <div className="flex justify-between text-success">
                            <span>Diskon membership</span><span className="font-medium">−{fmtRp(quote.membershipDiscount)}</span>
                          </div>
                        )}
                        {quote.pointsUsed > 0 && (
                          <div className="flex justify-between text-success">
                            <span>Poin terpakai</span><span className="font-medium">−{fmtRp(quote.pointsUsed)}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-5 pt-5 border-t border-border/60 flex items-end justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Total all-in</p>
                          <p className="font-display text-3xl font-bold text-primary">{fmtRp(total)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground text-right">Estimasi sampai<br /><span className="font-semibold text-foreground">7–14 hari</span></p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-5">
                        <Button variant="hero" onClick={continueBuy} disabled={!!actionLoading}>Lanjut Beli <ArrowRight className="h-4 w-4" /></Button>
                        <Button variant="outline" onClick={saveWishlist} disabled={!!actionLoading}><Bookmark className="h-4 w-4" /> Simpan</Button>
                        <Button variant="soft" size="sm" onClick={watchPrice} disabled={!!actionLoading}><Bell className="h-4 w-4" /> Pantau Harga</Button>
                        <Button variant="ghost" size="sm" onClick={findAlternative} disabled={!!actionLoading}>Cari Alternatif</Button>
                      </div>
                    </>
                  ) : (
                    <div className="m-auto text-center text-muted-foreground">
                      <p className="text-sm">Link produk diperlukan untuk menghitung estimasi harga.</p>
                      <p className="text-xs mt-2">
                        Tempel link dari Mercari, Rakuten, Amazon JP, atau marketplace Jepang lainnya.
                      </p>
                    </div>
                  )}
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
