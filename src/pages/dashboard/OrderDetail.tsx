import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Package, Copy, MessageCircle, ExternalLink, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { useOrder, useAddresses } from "@/hooks";
import { fmtRp, STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import { toast } from "sonner";

const OrderDetail = () => {
  const { id } = useParams();
  const { data: order, isLoading, error } = useOrder(id!);
  const { data: addresses = [] } = useAddresses();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Gagal memuat data</p>
        <p className="text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Order tidak ditemukan.</p>
      </div>
    );
  }

  const tracking = order.tracking ?? [];
  const address = addresses.find(a => a.id === order.address_id) ?? addresses[0];

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to="/dashboard/orders"><ArrowLeft className="h-4 w-4" />Kembali ke orders</Link>
      </Button>

      <PageHeader
        eyebrow={order.id}
        title={order.product}
        description={`Dipesan ${new Date(order.created_at).toLocaleDateString("id-ID")} · Estimasi sampai ${order.eta ? new Date(order.eta).toLocaleDateString("id-ID") : "TBA"}`}
        action={
          <>
            <Button variant="outline" asChild><Link to="/dashboard/ai-shopper"><MessageCircle className="h-4 w-4" />Tanya CS</Link></Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Tracking timeline */}
        <div className="lg:col-span-2 rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold">Tracking timeline</h2>
            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_TONE[order.status] ?? "bg-muted text-muted-foreground"}`}>
              {STATUS_LABEL[order.status] ?? order.status}
            </span>
          </div>
          {order.tracking_number && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
              <span className="font-mono">{order.tracking_number}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(order.tracking_number ?? ""); toast.success("Tracking number tersalin"); }}
                className="hover:text-primary"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}

          {tracking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada tracking timeline.</p>
          ) : (
            <ol className="relative space-y-5 ml-2">
              {tracking.map((t, i) => (
                <li key={t.id ?? i} className="flex gap-4">
                  <div className="relative flex flex-col items-center">
                    <div className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${
                      t.is_current ? "bg-primary text-primary-foreground shadow-glow animate-pulse-soft"
                      : t.is_done ? "bg-success/15 text-success border-2 border-success/40"
                      : "bg-muted text-muted-foreground"
                    }`}>
                      <Package className="h-4 w-4" />
                    </div>
                    {i < tracking.length - 1 && (
                      <div className={`w-0.5 flex-1 my-1 min-h-[20px] ${t.is_done ? "bg-success/40" : "bg-border"}`} />
                    )}
                  </div>
                  <div className={`pb-3 ${!t.is_done ? "opacity-50" : ""}`}>
                    <p className="font-semibold text-sm">{STATUS_LABEL[t.status] ?? t.status}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.occurred_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    {t.note && <p className="text-xs text-foreground/70 mt-1">{t.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Sidebar info */}
        <div className="space-y-5">
          <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
            <h3 className="font-display font-bold mb-4">Ringkasan biaya</h3>
            <div className="space-y-2 text-sm">
              {[
                ["Harga produk", order.price_jpy ? fmtRp(Math.round(order.price_jpy * (order.exchange_rate ?? 105))) : "—"],
                ["Fee jasa", fmtRp(order.service_fee)],
                ["Ongkir Jepang→Indo", fmtRp(order.shipping_cost)],
                ["Pajak & bea", fmtRp(order.tax_customs)],
                ...(order.membership_discount ? [["Diskon Plus", `−${fmtRp(order.membership_discount)}`]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-muted-foreground">
                  <span>{k}</span><span className="text-foreground">{v}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border/60 pt-3 mt-2 font-bold">
                <span>Total dibayar</span>
                <span className="text-primary">{fmtRp(order.total)}</span>
              </div>
            </div>
          </div>

          {address ? (
            <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
              <h3 className="font-display font-bold mb-3">Dikirim ke</h3>
              <p className="text-sm font-semibold">{address.recipient}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{address.phone}</p>
              <p className="text-sm mt-2">{address.line}</p>
              <p className="text-sm text-muted-foreground">{address.city} {address.postal}</p>
            </div>
          ) : (
            <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
              <h3 className="font-display font-bold mb-3">Dikirim ke</h3>
              <p className="text-sm text-muted-foreground">Alamat tidak tersedia.</p>
            </div>
          )}

          <div className="rounded-3xl bg-secondary/50 border border-border/40 p-6">
            <h3 className="font-display font-bold mb-2">Butuh bantuan?</h3>
            <p className="text-xs text-muted-foreground mb-3">Tim CS siap bantu 24/7 lewat WhatsApp.</p>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/dashboard/ai-shopper"><MessageCircle className="h-4 w-4" />Buka chat</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default OrderDetail;
