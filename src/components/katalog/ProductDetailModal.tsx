import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  CreditCard,
  X,
  Minus,
  Plus,
  Package,
  Ruler,
  Truck,
  Receipt,
} from "lucide-react";

import type { CatalogItem } from "@/hooks/useCatalog";
import { useAddToCart } from "@/hooks/useCart";
import { useAuth } from "@/contexts/AuthContext";
import {
  calculatePriceEstimate,
  formatRp,
  formatJpy,
} from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

// ── Props ───────────────────────────────────────────────────────────────────

interface ProductDetailModalProps {
  item: CatalogItem;
  open: boolean;
  onClose: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' fill='%23e2e8f0'%3E%3Crect width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2394a3b8' font-size='32'%3E📦%3C/text%3E%3C/svg%3E";

// ── Component ───────────────────────────────────────────────────────────────

export function ProductDetailModal({
  item,
  open,
  onClose,
}: ProductDetailModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const addToCart = useAddToCart();
  const { user } = useAuth();

  // ── Local state ───────────────────────────────────────────────────────────

  const [priceJpy, setPriceJpy] = useState<number>(
    item.price_jpy ?? 0,
  );
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);

  // Reset state when item or open state changes
  useEffect(() => {
    if (open) {
      setPriceJpy(item.price_jpy ?? 0);
      setQuantity(1);
      setIsAdding(false);
    }
  }, [open, item.price_jpy]);

  // ── Price calculation (memoized) ─────────────────────────────────────────

  const estimate = useMemo(
    () =>
      calculatePriceEstimate({
        priceJpy,
        shippingCategory: item.shipping_category ?? undefined,
      }),
    [priceJpy, item.shipping_category],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleQuantityChange = (delta: number) => {
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (next > 99) return 99;
      return next;
    });
  };

  const handleAddToCart = async () => {
    if (isAdding) return;
    if (!user) {
      toast({ title: "Login Diperlukan", description: "Silakan login atau daftar akun dulu ya" });
      onClose();
      navigate("/auth/login");
      return;
    }
    setIsAdding(true);
    try {
      await addToCart.mutateAsync({
        catalog_item_id: item.id,
        product_name: item.name,
        price_jpy: estimate.priceJpy,
        price_idr: estimate.priceIdr,
        image_url: item.images?.[0] ?? "",
        category: item.category,
        shipping_category: item.shipping_category ?? "general",
        quantity,
        estimated_fee: estimate.fee,
        estimated_shipping: estimate.shipping,
        estimated_tax: estimate.tax,
        estimated_total: estimate.total,
      });
      toast({
        title: "✓ Ditambahkan ke Keranjang",
        description: `${quantity}x ${item.name}`,
      });
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Gagal menambahkan ke keranjang";
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleBuyNow = async () => {
    // First add to cart, then navigate to checkout
    if (!user) {
      toast({ title: "Login Diperlukan", description: "Silakan login atau daftar akun dulu ya" });
      onClose();
      navigate("/auth/login");
      return;
    }
    try {
      await addToCart.mutateAsync({
        catalog_item_id: item.id,
        product_name: item.name,
        price_jpy: estimate.priceJpy,
        price_idr: estimate.priceIdr,
        image_url: item.images?.[0] ?? "",
        category: item.category,
        shipping_category: item.shipping_category ?? "general",
        quantity,
        estimated_fee: estimate.fee,
        estimated_shipping: estimate.shipping,
        estimated_tax: estimate.tax,
        estimated_total: estimate.total,
      });
      onClose();
      navigate("/checkout");
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memproses pesanan. Silakan coba lagi.",
      });
    }
  };

  // ── Early return (closed) ─────────────────────────────────────────────────

  if (!open) return null;

  // ── Image source ─────────────────────────────────────────────────────────

  const imgSrc = item.images?.[0]
    ? encodeURI(item.images[0])
    : FALLBACK_IMG;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border/60 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
        {/* ── Close button ── */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full bg-background/80 backdrop-blur border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Content ── */}
        <div className="flex flex-col md:flex-row">
          {/* ── Image section ── */}
          <div className="md:w-[45%] shrink-0 bg-muted/20">
            <div className="aspect-square overflow-hidden">
              <img
                src={imgSrc}
                alt={item.name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = FALLBACK_IMG;
                }}
              />
            </div>

            {/* Category badges under image on mobile, side on desktop */}
            <div className="flex flex-wrap gap-1.5 p-3 pt-2 md:hidden">
              {item.category && (
                <Badge variant="secondary" className="text-[10px]">
                  {item.category}
                </Badge>
              )}
              {item.sub_category && (
                <Badge variant="outline" className="text-[10px]">
                  {item.sub_category}
                </Badge>
              )}
            </div>
          </div>

          {/* ── Details section ── */}
          <div className="flex-1 p-5 md:p-6 space-y-5">
            {/* Category badges (desktop) */}
            <div className="hidden md:flex flex-wrap gap-1.5">
              {item.category && (
                <Badge variant="secondary" className="text-[10px]">
                  {item.category}
                </Badge>
              )}
              {item.sub_category && (
                <Badge variant="outline" className="text-[10px]">
                  {item.sub_category}
                </Badge>
              )}
            </div>

            {/* Product name */}
            <h2 className="font-display text-lg font-bold leading-snug">
              {item.name}
            </h2>

            {/* ── Price input ── */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Harga Produk (JPY)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                  ¥
                </span>
                <Input
                  type="number"
                  min={0}
                  value={priceJpy || ""}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setPriceJpy(isNaN(val) ? 0 : val);
                  }}
                  className="pl-8 text-sm font-semibold"
                  placeholder="0"
                />
              </div>
            </div>

            {/* ── Price breakdown ── */}
            <div className="space-y-2.5 bg-muted/30 rounded-2xl p-4 border border-border/30">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                Estimasi Biaya All-In
              </h3>

              <div className="space-y-2 text-sm">
                {/* Harga Produk */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                    Harga Produk
                  </span>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground block leading-tight">
                      {formatJpy(estimate.priceJpy)}
                    </span>
                    <span className="font-semibold">
                      {formatRp(estimate.priceIdr)}
                    </span>
                  </div>
                </div>

                <hr className="border-border/40" />

                {/* Fee Jasa */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Ruler className="h-3.5 w-3.5 text-muted-foreground/60" />
                    Fee Jasa
                  </span>
                  <span className="font-medium">{formatRp(estimate.fee)}</span>
                </div>

                {/* Estimasi Ongkir */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground/60" />
                    Estimasi Ongkir
                  </span>
                  <span className="font-medium">
                    {formatRp(estimate.shipping)}
                  </span>
                </div>

                {/* Pajak */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-muted-foreground/60" />
                    Pajak & Bea
                  </span>
                  <span className="font-medium">{formatRp(estimate.tax)}</span>
                </div>

                <hr className="border-border/40" />

                {/* Total */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Total</span>
                  <span className="text-lg font-bold text-primary">
                    {formatRp(estimate.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Quantity selector ── */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Quantity
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(-1)}
                  disabled={quantity <= 1}
                  className="h-9 w-9 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-10 text-center font-semibold text-base tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(1)}
                  disabled={quantity >= 99}
                  className="h-9 w-9 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>

                <span className="text-xs text-muted-foreground ml-auto">
                  Maks. 99
                </span>
              </div>
            </div>

            {/* ── Action buttons ── */}
            <div className="space-y-2.5 pt-1">
              <Button
                variant="default"
                size="lg"
                className="w-full gap-2"
                onClick={handleAddToCart}
                disabled={isAdding || addToCart.isPending}
              >
                <ShoppingCart className="h-4 w-4" />
                {isAdding || addToCart.isPending
                  ? "Menambahkan..."
                  : "Tambah ke Keranjang"}
              </Button>
              <Button
                variant="hero"
                size="lg"
                className="w-full gap-2"
                onClick={handleBuyNow}
                disabled={addToCart.isPending}
              >
                <CreditCard className="h-4 w-4" />
                Beli Langsung
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetailModal;
