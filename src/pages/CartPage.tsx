import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Navbar } from '@/components/site/Navbar'
import { Footer } from '@/components/site/Footer'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ArrowLeft,
  ShoppingBag,
  AlertTriangle,
  Loader2,
  CreditCard,
} from 'lucide-react'
import { useCartItems, useUpdateQuantity, useRemoveItem, useClearCart } from '@/hooks/useCart'
import { formatRp } from '@/lib/pricing'
import type { CartItem } from '@/services/cart.service'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getItemSubtotal(item: CartItem): number {
  return item.price_idr * item.quantity
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CartItemRow({
  item,
  onUpdateQuantity,
  onRemove,
  isUpdating,
}: {
  item: CartItem
  onUpdateQuantity: (itemId: string, quantity: number) => void
  onRemove: (itemId: string) => void
  isUpdating: boolean
}) {
  const subtotal = getItemSubtotal(item)

  return (
    <div className="flex gap-4 p-4 rounded-xl border border-border/50 bg-card">
      {/* Image thumbnail */}
      <div className="h-20 w-20 shrink-0 rounded-lg overflow-hidden bg-muted">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.product_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full grid place-items-center text-muted-foreground">
            <ShoppingBag className="h-6 w-6" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <h3 className="font-medium text-sm truncate">{item.product_name}</h3>
        <p className="text-xs text-muted-foreground">{item.category}</p>
        <p className="text-sm font-semibold">{formatRp(item.price_idr)}</p>
      </div>

      {/* Quantity controls */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        {/* Remove button */}
        <button
          onClick={() => onRemove(item.id)}
          disabled={isUpdating}
          className="h-7 w-7 grid place-items-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          aria-label="Hapus item"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        {/* Quantity stepper */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
            disabled={item.quantity <= 1 || isUpdating}
            className="h-7 w-7 grid place-items-center rounded-lg border border-border/50 bg-background hover:bg-secondary transition-colors disabled:opacity-40"
            aria-label="Kurangi jumlah"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 text-center text-sm font-medium tabular-nums">
            {item.quantity}
          </span>
          <button
            onClick={() => onUpdateQuantity(item.id, Math.min(99, item.quantity + 1))}
            disabled={item.quantity >= 99 || isUpdating}
            className="h-7 w-7 grid place-items-center rounded-lg border border-border/50 bg-background hover:bg-secondary transition-colors disabled:opacity-40"
            aria-label="Tambah jumlah"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Subtotal */}
        <p className="text-xs text-muted-foreground">
          Subtotal: <span className="font-semibold text-foreground">{formatRp(subtotal)}</span>
        </p>
      </div>
    </div>
  )
}

function EmptyCart() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
      <div className="h-16 w-16 rounded-full bg-muted grid place-items-center">
        <ShoppingCart className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">Keranjang belanja masih kosong</p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Tambahkan produk dari katalog atau minta AI Personal Shopper mencarikannya untukmu.
        </p>
      </div>
      <Button variant="hero" size="sm" className="gap-1.5" asChild>
        <Link to="/katalog">
          <ShoppingBag className="h-4 w-4" />
          Lihat Katalog
        </Link>
      </Button>
    </div>
  )
}

function CartSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex gap-4 p-4 rounded-xl border border-border/50 bg-card animate-pulse"
        >
          <div className="h-20 w-20 shrink-0 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/5 rounded bg-muted" />
            <div className="h-3 w-1/4 rounded bg-muted" />
            <div className="h-4 w-1/5 rounded bg-muted" />
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="h-7 w-7 rounded-full bg-muted" />
            <div className="flex gap-1">
              <div className="h-7 w-7 rounded-lg bg-muted" />
              <div className="h-7 w-8 rounded bg-muted" />
              <div className="h-7 w-7 rounded-lg bg-muted" />
            </div>
            <div className="h-3 w-20 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ClearCartButton({ onClear, isPending }: { onClear: () => void; isPending: boolean }) {
  const [showConfirm, setShowConfirm] = useState(false)

  if (!showConfirm) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={() => setShowConfirm(true)}
      >
        <Trash2 className="h-4 w-4" />
        Kosongkan Keranjang
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Yakin ingin menghapus semua item?</span>
      <Button
        variant="destructive"
        size="sm"
        className="gap-1.5"
        onClick={onClear}
        disabled={isPending}
      >
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Ya, Kosongkan
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
        Batal
      </Button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CartPage = () => {
  const navigate = useNavigate()

  const {
    data: items,
    isLoading,
    isError,
    error,
    refetch,
  } = useCartItems()

  const updateQuantity = useUpdateQuantity()
  const removeItem = useRemoveItem()
  const clearCart = useClearCart()

  const isPending =
    updateQuantity.isPending || removeItem.isPending || clearCart.isPending

  const handleUpdateQuantity = (itemId: string, quantity: number) => {
    updateQuantity.mutate({ itemId, quantity })
  }

  const handleRemoveItem = (itemId: string) => {
    removeItem.mutate(itemId)
  }

  const handleClearCart = () => {
    clearCart.mutate()
  }

  const handleCheckout = () => {
    // Navigate to checkout with cart items data
    const cartData = items?.map((i) => ({
      id: i.id,
      product_name: i.product_name,
      price_jpy: i.price_jpy,
      price_idr: i.price_idr,
      quantity: i.quantity,
      image_url: i.image_url,
      category: i.category,
      shipping_category: i.shipping_category,
      estimated_fee: i.estimated_fee,
      estimated_shipping: i.estimated_shipping,
      estimated_tax: i.estimated_tax,
      estimated_total: i.estimated_total,
      notes: i.notes,
    }))
    navigate('/checkout', { state: { cartItems: cartData } })
  }

  const subtotal = items
    ? items.reduce((sum, item) => sum + getItemSubtotal(item), 0)
    : 0

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-6 md:py-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" asChild>
              <Link to="/katalog">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Kembali</span>
              </Link>
            </Button>
            <h1 className="font-display text-xl md:text-2xl font-bold">Keranjang</h1>
          </div>

          {/* Clear cart button */}
          {items && items.length > 0 && (
            <ClearCartButton onClear={handleClearCart} isPending={clearCart.isPending} />
          )}
        </div>

        {/* Error state */}
        {isError && !isLoading && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Gagal memuat keranjang:{' '}
              {error instanceof Error ? error.message : 'Terjadi kesalahan'}
            </AlertDescription>
          </Alert>
        )}

        {/* Loading state */}
        {isLoading && !isError && <CartSkeleton />}

        {/* Empty state */}
        {!isLoading && !isError && (!items || items.length === 0) && <EmptyCart />}

        {/* Cart items */}
        {!isLoading && !isError && items && items.length > 0 && (
          <>
            <div className="space-y-3">
              {items.map((item) => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemove={handleRemoveItem}
                  isUpdating={isPending}
                />
              ))}
            </div>

            {/* Summary section */}
            <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
              <h2 className="font-display font-semibold text-sm">Ringkasan Belanja</h2>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Subtotal ({items.length} item{items.length > 1 ? 's' : ''})
                  </span>
                  <span className="font-semibold">{formatRp(subtotal)}</span>
                </div>
              </div>

              <div className="border-t border-border/60 pt-4">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium">Total</span>
                  <span className="text-lg font-bold text-primary">{formatRp(subtotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  *Biaya layanan & pengiriman akan dihitung saat checkout
                </p>
              </div>

              <Button
                variant="hero"
                size="lg"
                className="w-full gap-2"
                onClick={handleCheckout}
              >
                <CreditCard className="h-4 w-4" />
                Lanjut ke Checkout
              </Button>
            </div>
          </>
        )}

        {/* Not authenticated message */}
        {!isLoading && !items && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Silakan{' '}
              <Link
                to="/auth/login"
                className="text-primary underline underline-offset-2"
              >
                masuk
              </Link>{' '}
              atau{' '}
              <Link
                to="/auth/register"
                className="text-primary underline underline-offset-2"
              >
                daftar
              </Link>{' '}
              untuk melihat keranjang belanja.
            </p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}

export default CartPage
