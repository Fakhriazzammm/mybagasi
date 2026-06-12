import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useLocation, useNavigate, Link } from "react-router-dom";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { createInvoice } from "@/lib/mayar";
import { supabase } from "@/lib/supabase";
import { calculatePriceEstimate, formatRp, getShippingRate } from "@/lib/pricing";
import {
  CreditCard,
  ExternalLink,
  Loader2,
  ShoppingBag,
  ChevronLeft,
  Trash2,
  Package,
  Minus,
  Plus,
  AlertTriangle,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CartItemState {
  id: string;
  product_name: string;
  price_jpy: number;
  price_idr: number;
  quantity: number;
  image_url: string;
  category: string;
  shipping_category: string;
  estimated_fee: number;
  estimated_shipping: number;
  estimated_tax: number;
  estimated_total: number;
  notes: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_EMAIL = import.meta.env.VITE_MAYAR_DEFAULT_EMAIL as string;
const DEFAULT_MOBILE = import.meta.env.VITE_MAYAR_DEFAULT_MOBILE as string;
const APP_BASE_URL = import.meta.env.VITE_APP_BASE_URL as string;

// ─── Pricing helpers ───────────────────────────────────────────────────────────

function calculateCartTotals(items: CartItemState[]) {
  const itemSubtotals = items.map((i) => ({
    ...i,
    subtotal: i.price_idr * i.quantity,
  }));
  const totalItemPrice = itemSubtotals.reduce((s, i) => s + i.subtotal, 0);

  // Fee (tiered logic matching pricing.ts)
  const feeService =
    totalItemPrice < 1_000_000
      ? 100_000
      : totalItemPrice < 3_000_000
        ? 300_000
        : totalItemPrice < 5_000_000
          ? 500_000
          : totalItemPrice < 10_000_000
            ? 1_000_000
            : 2_000_000;

  // Use the first item's shipping category, fallback to general
  const shippingCategory = items[0]?.shipping_category ?? "general";
  const shipping = getShippingRate(shippingCategory);

  const tax = Math.round((totalItemPrice + feeService) * 0.11);
  const grandTotal = totalItemPrice + feeService + shipping + tax;

  return { itemSubtotals, totalItemPrice, feeService, shipping, tax, grandTotal };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CartItemRow({
  item,
  subtotal,
  onUpdateQuantity,
  onRemove,
}: {
  item: CartItemState;
  subtotal: number;
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-xl border border-border/50 bg-card">
      {/* Thumbnail */}
      <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-muted">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.product_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full grid place-items-center text-muted-foreground">
            <Package className="h-5 w-5" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium truncate">{item.product_name}</p>
        <p className="text-xs text-muted-foreground">{item.category}</p>
        <p className="text-sm font-semibold">{formatRp(item.price_idr)}</p>
      </div>

      {/* Qty + subtotal */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {/* Remove */}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="h-6 w-6 grid place-items-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Hapus item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {/* Quantity stepper */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
            disabled={item.quantity <= 1}
            className="h-6 w-6 grid place-items-center rounded-md border border-border/50 bg-background hover:bg-secondary transition-colors disabled:opacity-40"
            aria-label="Kurangi jumlah"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-7 text-center text-xs font-medium tabular-nums">
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.id, Math.min(99, item.quantity + 1))}
            disabled={item.quantity >= 99}
            className="h-6 w-6 grid place-items-center rounded-md border border-border/50 bg-background hover:bg-secondary transition-colors disabled:opacity-40"
            aria-label="Tambah jumlah"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Subtotal */}
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{formatRp(subtotal)}</span>
        </p>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const CheckoutPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { profile, user, getDashboardRoute } = useAuth();

  // ── Source: location.state (from CartPage) or URL params (from AI Shopper) ──
  const stateItems = (location.state as { cartItems?: CartItemState[] } | null)
    ?.cartItems;

  const [cartItems, setCartItems] = useState<CartItemState[]>(() => {
    // Prefer state items
    if (stateItems && stateItems.length > 0) return stateItems;

    // Fallback: build a single item from URL params
    const orderId = params.get("order_id");
    // If we have an order_id, we could look it up — but for now bail
    // and let the useEffect handle order_id fetching for display.
    if (orderId) return [];

    const productName = params.get("product") ?? "";
    const priceRaw = parseInt(params.get("price") ?? "0", 10);
    if (!productName || priceRaw <= 0) return [];

    return [
      {
        id: "url-param-item",
        product_name: productName,
        price_jpy: 0,
        price_idr: priceRaw,
        quantity: 1,
        image_url: "",
        category: params.get("category") ?? "general",
        shipping_category: params.get("shipping_category") ?? "general",
        estimated_fee: 0,
        estimated_shipping: 0,
        estimated_tax: 0,
        estimated_total: priceRaw,
        notes: "",
      },
    ];
  });

  // ── DB order fallback (order_id param for existing orders from AI Shopper) ──
  const orderId = params.get("order_id");
  const [dbOrder, setDbOrder] = useState<Record<string, unknown> | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);

  useEffect(() => {
    if (orderId && cartItems.length === 0) {
      setLoadingOrder(true);
      supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            setDbOrder(data as Record<string, unknown>);
            // Promote to cart item
            setCartItems([
              {
                id: orderId,
                product_name: (data as Record<string, unknown>)?.product as string ?? "Produk dari Jepang",
                price_jpy: 0,
                price_idr: (data as Record<string, unknown>)?.total as number ?? 0,
                quantity: 1,
                image_url: "",
                category: "general",
                shipping_category: "general",
                estimated_fee: 0,
                estimated_shipping: 0,
                estimated_tax: 0,
                estimated_total: (data as Record<string, unknown>)?.total as number ?? 0,
                notes: "",
              },
            ]);
          }
          setLoadingOrder(false);
        });
    }
  }, [orderId, cartItems.length]);

  // ── Derived pricing ──────────────────────────────────────────────────────────
  const totals = useMemo(() => calculateCartTotals(cartItems), [cartItems]);

  // ── Navigation metadata ──────────────────────────────────────────────────────
  const backLink = params.get("from") || "/aipersonalshopper";
  const backLabel =
    params.get("from") === "/aipersonalshopper"
      ? "Kembali ke Personal Shopper"
      : params.get("from") === "/cart"
        ? "Kembali ke Keranjang"
        : "Kembali ke AI Shopper";

  // ── Form state ───────────────────────────────────────────────────────────────
  const [form, setForm] = useState({ name: "", email: "", mobile: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from auth profile
  useEffect(() => {
    setForm((prev) => ({
      name: profile?.name ?? prev.name,
      email: user?.email ?? prev.email,
      mobile: prev.mobile,
    }));
  }, [profile, user]);

  const setField =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── Cart mutation helpers ────────────────────────────────────────────────────
  const handleUpdateQuantity = (id: string, quantity: number) => {
    setCartItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity } : i)),
    );
  };

  const handleRemoveItem = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Guard: no items
    if (cartItems.length === 0) {
      setError("Tidak ada item untuk diproses. Silakan tambahkan produk terlebih dahulu.");
      setLoading(false);
      return;
    }

    try {
      // Build line items from each cart item
      const itemLines = cartItems
        .filter((i) => i.price_idr > 0)
        .map((i) => ({
          description: `${i.product_name}${i.quantity > 1 ? ` (x${i.quantity})` : ""}`,
          quantity: i.quantity,
          rate: i.price_idr,
        }));

      // Additional fee / shipping / tax lines
      const extraLines: Array<{ description: string; quantity: number; rate: number }> = [];
      if (totals.feeService > 0) {
        extraLines.push({
          description: "Fee Jasa MyBagasi",
          quantity: 1,
          rate: totals.feeService,
        });
      }
      extraLines.push({
        description: `Estimasi Ongkir (${cartItems[0]?.shipping_category ?? "general"})`,
        quantity: 1,
        rate: totals.shipping,
      });
      if (totals.tax > 0) {
        extraLines.push({
          description: "Estimasi Pajak & Bea Masuk (11%)",
          quantity: 1,
          rate: totals.tax,
        });
      }

      // Product description — list all items
      const productDescription = cartItems
        .map((i) => `${i.product_name}${i.quantity > 1 ? ` (x${i.quantity})` : ""}`)
        .join(", ");

      const description = `Pembelian ${productDescription} via MyBagasi`;

      const invoice = await createInvoice({
        name: form.name,
        email: form.email || DEFAULT_EMAIL,
        mobile: form.mobile || DEFAULT_MOBILE,
        description,
        redirectUrl: `${APP_BASE_URL}/payment/status`,
        custom_field:
          orderId ? [{ key: "order_id", value: orderId, type: "string" }] : undefined,
        items: [...itemLines, ...extraLines],
      });

      // Redirect to Mayar payment page
      window.location.href = invoice.link;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "detail" in err
            ? String((err as { detail: unknown }).detail)
            : "Terjadi kesalahan saat membuat invoice. Silakan coba lagi.";

      // Provide a more helpful message for [object Object] cases
      setError(
        message.includes("[object Object]") || message.trim() === "[object Object]"
          ? "Gagal memproses pesanan — data item tidak valid. Periksa kembali item di keranjang dan coba lagi."
          : message,
      );
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!getDashboardRoute) {
    return null;
  }

  const isEmpty = cartItems.length === 0 && !loadingOrder;

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

        {/* Header */}
        <div className="text-center mb-8">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-primary text-primary-foreground grid place-items-center mb-4">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h1 className="font-display text-3xl font-bold mb-2">Checkout</h1>
          <p className="text-muted-foreground text-sm">
            {cartItems.length > 0
              ? `Kamu akan membeli ${cartItems.length} item dari MyBagasi.`
              : "Lengkapi data diri untuk melanjutkan ke halaman pembayaran Mayar."}
          </p>
        </div>

        {/* Loading order from DB */}
        {loadingOrder && (
          <div className="space-y-4 mb-8">
            <div className="h-20 bg-muted rounded-xl animate-pulse" />
            <div className="h-20 bg-muted rounded-xl animate-pulse" />
          </div>
        )}

        {/* Empty state */}
        {isEmpty && !loadingOrder && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              Tidak ada item untuk di-checkout.
            </p>
            <Button variant="hero" size="sm" asChild>
              <Link to="/katalog">Lihat Katalog</Link>
            </Button>
          </div>
        )}

        {!isEmpty && !loadingOrder && (
          <div className="grid gap-6 md:grid-cols-5">
            {/* ── Left: Cart items ───────────────────────────────────────── */}
            <div className="md:col-span-3 space-y-4">
              {/* Customer form */}
              <form id="checkout-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
                  <h2 className="font-semibold text-sm mb-4">Data Pembeli</h2>
                  <div className="space-y-3">
                    {(
                      [
                        {
                          key: "name" as const,
                          label: "Nama Lengkap",
                          type: "text",
                          placeholder: "Nama kamu",
                          required: true,
                        },
                        {
                          key: "email" as const,
                          label: "Email",
                          type: "email",
                          placeholder: "email@kamu.com",
                          required: true,
                        },
                        {
                          key: "mobile" as const,
                          label: "Nomor HP",
                          type: "tel",
                          placeholder: "08xxxxxxxxxx",
                          required: true,
                        },
                      ] as const
                    ).map(({ key, label, type, placeholder, required }) => (
                      <div key={key}>
                        <label className="text-sm font-medium mb-1.5 block">
                          {label}{" "}
                          {required && <span className="text-destructive">*</span>}
                        </label>
                        <Input
                          type={type}
                          required={required}
                          value={form[key]}
                          onChange={setField(key)}
                          placeholder={placeholder}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </form>

              {/* Items list */}
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-sm">
                    Item ({cartItems.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {cartItems.map((item) => {
                    const idx = totals.itemSubtotals.findIndex(
                      (t) => t.id === item.id,
                    );
                    const subtotal =
                      idx >= 0 ? totals.itemSubtotals[idx].subtotal : 0;
                    return (
                      <CartItemRow
                        key={item.id}
                        item={item}
                        subtotal={subtotal}
                        onUpdateQuantity={handleUpdateQuantity}
                        onRemove={handleRemoveItem}
                      />
                    );
                  })}
                </div>
                {cartItems.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Semua item telah dihapus.
                  </p>
                )}
              </div>
            </div>

            {/* ── Right: Order summary ───────────────────────────────────── */}
            <div className="md:col-span-2 space-y-4">
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-5 h-fit sticky top-24">
                <h2 className="font-semibold text-sm mb-4">Ringkasan Order</h2>

                <div className="space-y-2 text-xs text-muted-foreground">
                  {/* Per-item subtotals */}
                  {totals.itemSubtotals.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between text-[11px]"
                    >
                      <span className="truncate mr-2">
                        {item.product_name}
                        {item.quantity > 1 ? ` (x${item.quantity})` : ""}
                      </span>
                      <span className="text-foreground shrink-0">
                        {formatRp(item.subtotal)}
                      </span>
                    </div>
                  ))}

                  <div className="flex justify-between pt-2 border-t border-border/40">
                    <span>Subtotal</span>
                    <span className="text-foreground font-medium">
                      {formatRp(totals.totalItemPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Jasa MyBagasi</span>
                    <span className="text-foreground">
                      {formatRp(totals.feeService)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. Ongkir</span>
                    <span className="text-foreground">
                      {formatRp(totals.shipping)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. Pajak & Bea (11%)</span>
                    <span className="text-foreground">
                      {formatRp(totals.tax)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border/60 pt-2 mt-1 font-bold text-foreground text-sm">
                    <span>Total</span>
                    <span className="text-primary">
                      {formatRp(totals.grandTotal)}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground mt-4 pt-4 border-t border-border/40">
                  Harga final dikonfirmasi setelah pengecekan produk oleh tim kami.
                </p>

                {/* Error */}
                {error && (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 mt-4 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit */}
                {cartItems.length > 0 && (
                  <Button
                    type="submit"
                    form="checkout-form"
                    variant="hero"
                    size="lg"
                    disabled={loading}
                    className="w-full gap-2 mt-4"
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
                )}

                <p className="text-center text-xs text-muted-foreground mt-3">
                  Kamu akan diarahkan ke halaman pembayaran Mayar yang aman.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default CheckoutPage;
