import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingBag, Bell, Trash2, Plus, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { useWishlist, useRemoveWishlistItem, useAddWishlistItem, useCreatePriceAlert, useCreateOrder } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { toast } from "sonner";

const Wishlist = () => {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ emoji: "🛍️", name: "", url: "", price_idr: "", source: "", note: "" });
  const { data: wishlist = [], isLoading, error } = useWishlist();

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Gagal memuat data</p>
        <p className="text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }
  const removeMutation = useRemoveWishlistItem();
  const addMutation = useAddWishlistItem();
  const alertMutation = useCreatePriceAlert();
  const orderMutation = useCreateOrder();

  const submitWishlist = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return toast.error("Nama produk wajib diisi");
    try {
      await addMutation.mutateAsync({
        emoji: form.emoji || "🛍️",
        name: form.name.trim(),
        url: form.url.trim() || null,
        price_idr: form.price_idr ? Number(form.price_idr) : null,
        source: form.source.trim() || null,
        note: form.note.trim() || null,
      });
      setForm({ emoji: "🛍️", name: "", url: "", price_idr: "", source: "", note: "" });
      setShowForm(false);
      toast.success("Produk masuk wishlist");
    } catch (err: any) { toast.error("Gagal menyimpan wishlist", { description: err.message }); }
  };

  const buyItem = async (w: any) => {
    if (!w.price_idr) return navigate(`/quotation?url=${encodeURIComponent(w.url ?? "")}&query=${encodeURIComponent(w.name)}`);
    try {
      const order = await orderMutation.mutateAsync({
        product: w.name,
        source: w.source ?? undefined,
        service_fee: Math.round(w.price_idr * 0.08),
        shipping_cost: 185000,
        tax_customs: Math.round(w.price_idr * 0.1),
        total: w.price_idr + Math.round(w.price_idr * 0.08) + 185000 + Math.round(w.price_idr * 0.1),
        notes: w.url ? `Dari wishlist: ${w.url}` : "Dari wishlist",
      });
      toast.success("Order draft dibuat");
      navigate(`/checkout?order_id=${order.id}`);
    } catch (err: any) { toast.error("Gagal membuat order", { description: err.message }); }
  };

  const createAlert = async (w: any) => {
    const targetInput = window.prompt("Target harga IDR", w.price_idr ? String(Math.round(w.price_idr * 0.9)) : "");
    if (!targetInput) return;
    const target = Number(targetInput.replace(/[^0-9]/g, ""));
    if (!target) return toast.error("Target harga tidak valid");
    try {
      await alertMutation.mutateAsync({ product: w.name, url: w.url, current_price: w.price_idr, target_price: target });
      toast.success("Price alert aktif");
    } catch (err: any) { toast.error("Gagal membuat alert", { description: err.message }); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Wishlist"
        title="Barang yang kamu incar"
        description="Simpan produk untuk dipantau atau dibeli nanti."
        action={<Button variant="hero" onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" />Tambah Produk</Button>}
      />

      {showForm && (
        <form onSubmit={submitWishlist} className="rounded-3xl bg-card border border-border/40 p-5 mb-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <input className="rounded-xl border bg-background px-3 py-2" placeholder="Emoji" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
          <input className="rounded-xl border bg-background px-3 py-2" placeholder="Nama produk" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="rounded-xl border bg-background px-3 py-2" placeholder="URL produk" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input className="rounded-xl border bg-background px-3 py-2" placeholder="Harga IDR" inputMode="numeric" value={form.price_idr} onChange={(e) => setForm({ ...form, price_idr: e.target.value.replace(/[^0-9]/g, "") })} />
          <input className="rounded-xl border bg-background px-3 py-2" placeholder="Marketplace" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <input className="rounded-xl border bg-background px-3 py-2" placeholder="Catatan" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Button type="submit" variant="hero" disabled={addMutation.isPending}>Simpan ke database</Button>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : wishlist.length === 0 ? (
        <div className="rounded-3xl bg-card border border-border/40 p-12 text-center text-muted-foreground">
          Wishlist kosong. Tambahkan produk yang ingin kamu beli.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {wishlist.map((w) => (
            <div key={w.id} className="rounded-3xl bg-card border border-border/40 p-5 shadow-soft hover:shadow-card transition-all group">
              <div className="aspect-square rounded-2xl bg-gradient-warm grid place-items-center text-7xl mb-4">
                {w.emoji}
              </div>
              <p className="font-semibold leading-tight line-clamp-2 min-h-[2.5rem]">{w.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {w.source ?? "—"} · {w.note ?? ""}
              </p>
              <p className="font-display text-xl font-bold text-primary mt-3">
                {w.price_idr ? fmtRp(w.price_idr) : "Harga belum diketahui"}
              </p>
              <div className="flex gap-2 mt-4">
                <Button variant="hero" size="sm" className="flex-1" onClick={() => buyItem(w)} disabled={orderMutation.isPending}>
                  <ShoppingBag className="h-3.5 w-3.5" />Beli
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => createAlert(w)} disabled={alertMutation.isPending}>
                  <Bell className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMutation.mutate(w.id)}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default Wishlist;
