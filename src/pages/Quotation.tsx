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
};

const fmt = (n: number) => "Rp " + n.toLocaleString("id-ID");

const Quotation = () => {
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { url: "", query: "", budget: "" },
  });

  const onSubmit = (data: FormData) => {
    setLoading(true);
    setQuote(null);
    setTimeout(() => {
      const productJpy = 9800 + Math.floor(Math.random() * 6000);
      const rate = 105;
      const productIdr = productJpy * rate;
      setQuote({
        product: data.query || "Produk dari link " + (data.url?.slice(0, 30) || ""),
        productJpy,
        rate,
        fee: Math.round(productIdr * 0.15),
        shipping: 285000,
        tax: Math.round(productIdr * 0.1),
        membershipDiscount: 45000,
        pointsUsed: 12000,
      });
      setLoading(false);
      toast.success("Quotation siap!");
    }, 1400);
  };

  const total = quote
    ? quote.productJpy * quote.rate + quote.fee + quote.shipping + quote.tax - quote.membershipDiscount - quote.pointsUsed
    : 0;

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
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Menghitung...</> : <><Sparkles className="h-4 w-4" /> Hitung Estimasi</>}
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
                  <p className="text-sm text-muted-foreground">AI sedang scrape produk & hitung harga...</p>
                </div>
              )}
              {quote && (
                <>
                  <div className="flex items-start gap-3 mb-5">
                    <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
                      <ShoppingBag className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Quotation #Q-{Math.floor(Math.random() * 9000 + 1000)}</p>
                      <p className="font-semibold truncate">{quote.product}</p>
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-semibold">● Active</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    {[
                      ["Harga produk", `¥${quote.productJpy.toLocaleString()} · ${fmt(quote.productJpy * quote.rate)}`],
                      ["Kurs JPY → IDR", `Rp ${quote.rate}`],
                      ["Fee jasa MyBagasi", fmt(quote.fee)],
                      ["Ongkir Jepang → Indo", fmt(quote.shipping)],
                      ["Pajak & bea cukai", fmt(quote.tax)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-muted-foreground">
                        <span>{k}</span><span className="text-foreground font-medium">{v}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-success">
                      <span>Diskon membership Plus</span><span className="font-medium">−{fmt(quote.membershipDiscount)}</span>
                    </div>
                    <div className="flex justify-between text-success">
                      <span>Poin terpakai (1.200 pts)</span><span className="font-medium">−{fmt(quote.pointsUsed)}</span>
                    </div>
                  </div>
                  <div className="mt-5 pt-5 border-t border-border/60 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Total all-in</p>
                      <p className="font-display text-3xl font-bold text-primary">{fmt(total)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground text-right">Estimasi sampai<br /><span className="font-semibold text-foreground">7–14 hari</span></p>
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
