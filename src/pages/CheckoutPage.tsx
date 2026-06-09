import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  ExternalLink,
  Loader2,
  ShoppingBag,
  ChevronLeft,
} from "lucide-react";
import { createInvoice } from "@/lib/mayar";
import { supabase } from "@/lib/supabase";

const DEFAULT_EMAIL = import.meta.env.VITE_MAYAR_DEFAULT_EMAIL as string;
const DEFAULT_MOBILE = import.meta.env.VITE_MAYAR_DEFAULT_MOBILE as string;
const APP_BASE_URL = import.meta.env.VITE_APP_BASE_URL as string;

const CheckoutPage = () => {
  const [params] = useSearchParams();
  const orderId = params.get("order_id");

  const [dbOrder, setDbOrder] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(false);

  useEffect(() => {
    if (orderId) {
      setLoadingOrder(true);
      supabase.from('orders').select('*').eq('id', orderId).single()
        .then(({ data, error }) => {
          if (!error && data) setDbOrder(data);
          setLoadingOrder(false);
        });
    }
  }, [orderId]);

  const productName = dbOrder?.product ?? params.get("product") ?? "Produk dari Jepang";
  const productPrice = dbOrder?.total ?? parseInt(params.get("price") ?? "0", 10);
  const sourceUrl = params.get("url") ?? "";

  const backLink = params.get("from") || "/dashboard/ai-shopper";
  const backLabel = params.get("from") === "/quotation" ? "Kembali ke Quotation" : "Kembali ke AI Shopper";

  const feeService = Math.round(productPrice * 0.15);
  const shipping = 250_000;
  const tax = Math.round((productPrice + feeService) * 0.08);
  const total = productPrice + feeService + shipping + tax;

  const [form, setForm] = useState({ name: "", email: "", mobile: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const invoice = await createInvoice({
        name: form.name,
        email: form.email || DEFAULT_EMAIL,
        mobile: form.mobile || DEFAULT_MOBILE,
        description: `Pembelian ${productName} via MyBagasi${sourceUrl ? ` — ${sourceUrl}` : ""}`,
        redirectUrl: `${APP_BASE_URL}/payment/status`,
        items: [
          ...(productPrice > 0
            ? [{ description: productName, quantity: 1, rate: productPrice }]
            : [{ description: productName, quantity: 1, rate: 0 }]),
          ...(feeService > 0
            ? [{ description: "Fee Jasa MyBagasi (15%)", quantity: 1, rate: feeService }]
            : []),
          { description: "Estimasi Ongkir Jepang→Indonesia", quantity: 1, rate: shipping },
          ...(tax > 0
            ? [{ description: "Estimasi Pajak & Bea Masuk (8%)", quantity: 1, rate: tax }]
            : []),
        ],
      });

      // Redirect to Mayar payment page
      window.location.href = invoice.link;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat invoice");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-10 md:py-16 max-w-2xl px-4">
        {/* Back link */}
        <Link
          to={backLink}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </Link>

        <div className="text-center mb-8">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-primary text-primary-foreground grid place-items-center mb-4">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h1 className="font-display text-3xl font-bold mb-2">Checkout</h1>
          <p className="text-muted-foreground text-sm">
            Lengkapi data diri untuk melanjutkan ke halaman pembayaran Mayar.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-5">
          {/* Order summary */}
          <div className="md:col-span-2 rounded-2xl border border-border/60 bg-muted/30 p-5 h-fit">
            <h2 className="font-semibold text-sm mb-4">Ringkasan Order</h2>
            {loadingOrder ? (
              <div className="space-y-3">
                <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
                <div className="h-4 bg-muted rounded w-full animate-pulse" />
                <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
              </div>
            ) : (
              <>
                <p className="text-sm font-medium mb-4 line-clamp-2">{productName}</p>
                {productPrice > 0 ? (
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Harga produk</span>
                      <span className="text-foreground">
                        Rp {productPrice.toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Jasa MyBagasi (15%)</span>
                      <span className="text-foreground">
                        Rp {feeService.toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Est. ongkir</span>
                      <span className="text-foreground">
                        Rp {shipping.toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Est. pajak & bea</span>
                      <span className="text-foreground">Rp {tax.toLocaleString("id-ID")}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/60 pt-2 mt-1 font-bold text-foreground text-sm">
                      <span>Total</span>
                      <span className="text-primary">
                        Rp {total.toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Harga akan dikonfirmasi oleh tim MyBagasi setelah order dibuat.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-4 pt-4 border-t border-border/40">
                  Harga final dikonfirmasi setelah pengecekan produk oleh tim kami.
                </p>
              </>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="md:col-span-3 space-y-4">
            {[
              { key: "name", label: "Nama Lengkap", type: "text", placeholder: "Nama kamu", required: true },
              { key: "email", label: "Email", type: "email", placeholder: "email@kamu.com", required: true },
              { key: "mobile", label: "Nomor HP", type: "tel", placeholder: "08xxxxxxxxxx", required: true },
            ].map(({ key, label, type, placeholder, required }) => (
              <div key={key}>
                <label className="text-sm font-medium mb-1.5 block">
                  {label} {required && <span className="text-destructive">*</span>}
                </label>
                <input
                  type={type}
                  required={required}
                  value={form[key as keyof typeof form]}
                  onChange={set(key as keyof typeof form)}
                  placeholder={placeholder}
                  className="w-full rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-sm outline-none focus:border-primary/50 focus:bg-background transition-colors"
                />
              </div>
            ))}

            {error && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="hero"
              size="lg"
              disabled={loading}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Membuat invoice...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Bayar via Mayar
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Kamu akan diarahkan ke halaman pembayaran Mayar yang aman.
            </p>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CheckoutPage;
