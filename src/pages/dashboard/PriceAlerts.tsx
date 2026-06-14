import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, TrendingDown, Plus, Pause, Loader2, Play } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { usePriceAlerts, useCreatePriceAlert, useUpdatePriceAlert, usePausePriceAlert, useResumePriceAlert, useCreateOrder } from "@/hooks";
import { fmtRp } from "@/lib/format";
import { calculatePriceEstimate } from "@/lib/pricing";
import { toast } from "sonner";

const PriceAlerts = () => {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product: "", url: "", current_price: "", target_price: "" });
  const { data: priceAlerts = [], isLoading, error } = usePriceAlerts();
  const createMutation = useCreatePriceAlert();
  const updateMutation = useUpdatePriceAlert();
  const pauseMutation = usePausePriceAlert();
  const resumeMutation = useResumePriceAlert();
  const orderMutation = useCreateOrder();

  const submitAlert = async (event: React.FormEvent) => {
    event.preventDefault();
    const target = Number(form.target_price);
    if (!form.product.trim() || !target) return toast.error("Produk dan target harga wajib diisi");
    try {
      await createMutation.mutateAsync({
        product: form.product.trim(),
        url: form.url.trim() || null,
        current_price: form.current_price ? Number(form.current_price) : null,
        target_price: target,
      });
      setForm({ product: "", url: "", current_price: "", target_price: "" });
      setShowForm(false);
      toast.success("Price alert aktif");
    } catch (err: any) { toast.error("Gagal membuat alert", { description: err.message }); }
  };

  const editTarget = async (a: any) => {
    const input = window.prompt("Target harga baru (IDR)", String(a.target_price));
    if (!input) return;
    const target = Number(input.replace(/[^0-9]/g, ""));
    if (!target) return toast.error("Target harga tidak valid");
    try { await updateMutation.mutateAsync({ id: a.id, updates: { target_price: target, status: "monitoring" } }); toast.success("Target diperbarui"); }
    catch (err: any) { toast.error("Gagal update alert", { description: err.message }); }
  };

  const buyNow = async (a: any) => {
    try {
      const current = a.current_price ?? a.target_price;
      const est = calculatePriceEstimate({ priceIdr: current });
      const order = await orderMutation.mutateAsync({
        product: a.product,
        source: a.url ? new URL(a.url).hostname : undefined,
        service_fee: est.fee,
        shipping_cost: est.shipping,
        tax_customs: est.tax,
        total: est.total,
        notes: a.url ? `Dari price alert: ${a.url}` : "Dari price alert",
      });
      toast.success("Order draft dibuat");
      navigate(`/checkout?order_id=${order.id}`);
    } catch (err: any) { toast.error("Gagal membuat order", { description: err.message }); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Price Alerts"
        title="Pantau harga impianmu"
        description="Kami pantau 24/7 dan kabari saat target harga tercapai atau stok ready."
        action={<Button variant="hero" onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" />Buat Alert</Button>}
      />

      {showForm && (
        <form onSubmit={submitAlert} className="rounded-3xl bg-card border border-border/40 p-5 mb-6 grid md:grid-cols-4 gap-3">
          <input className="rounded-xl border bg-background px-3 py-2" placeholder="Produk" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
          <input className="rounded-xl border bg-background px-3 py-2" placeholder="URL produk" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input className="rounded-xl border bg-background px-3 py-2" placeholder="Harga sekarang" inputMode="numeric" value={form.current_price} onChange={(e) => setForm({ ...form, current_price: e.target.value.replace(/[^0-9]/g, "") })} />
          <input className="rounded-xl border bg-background px-3 py-2" placeholder="Target harga" inputMode="numeric" value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value.replace(/[^0-9]/g, "") })} />
          <Button type="submit" variant="hero" disabled={createMutation.isPending}>Simpan ke database</Button>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-destructive">Gagal memuat data</p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
        </div>
      ) : priceAlerts.length === 0 ? (
        <div className="rounded-3xl bg-card border border-border/40 p-12 text-center text-muted-foreground">
          Belum ada price alert. Buat alert pertama untuk pantau harga.
        </div>
      ) : (
        <div className="space-y-3">
          {priceAlerts.map((a) => {
            const currentPrice = a.current_price ?? 0;
            const diff = currentPrice - a.target_price;
            const triggered = a.status === "triggered";
            const paused = a.status === "paused";
            return (
              <div key={a.id} className={`rounded-3xl border p-5 shadow-soft ${triggered ? "bg-success/5 border-success/30" : "bg-card border-border/40"}`}>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className={`h-12 w-12 rounded-2xl grid place-items-center shrink-0 ${triggered ? "bg-success text-success-foreground" : "bg-primary-soft text-primary"}`}>
                    {triggered ? <TrendingDown className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{a.product}</p>
                      {triggered && <span className="text-[10px] px-2 py-0.5 rounded-full bg-success text-success-foreground font-semibold">TARGET TERCAPAI</span>}
                      {paused && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">PAUSED</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Target {fmtRp(a.target_price)} · Cek terakhir {a.last_checked_at ? new Date(a.last_checked_at).toLocaleDateString("id-ID") : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Harga sekarang</p>
                      <p className="font-display text-xl font-bold">{a.current_price != null ? fmtRp(a.current_price) : "—"}</p>
                      <p className={`text-xs font-semibold ${diff > 0 ? "text-warning" : diff < 0 ? "text-success" : ""}`}>
                        {diff > 0 ? `+${fmtRp(diff)}` : diff < 0 ? fmtRp(diff) : "Sama"} dari target
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {triggered ? (
                        <Button variant="hero" size="sm" onClick={() => buyNow(a)} disabled={orderMutation.isPending}>Beli Sekarang</Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => editTarget(a)} disabled={updateMutation.isPending}>Edit Target</Button>
                      )}
                      {paused ? (
                        <Button variant="ghost" size="sm" onClick={() => resumeMutation.mutate(a.id)} disabled={resumeMutation.isPending}><Play className="h-3.5 w-3.5" />Resume</Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => pauseMutation.mutate(a.id)} disabled={pauseMutation.isPending}><Pause className="h-3.5 w-3.5" />Pause</Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default PriceAlerts;
