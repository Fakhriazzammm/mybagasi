import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Package, Copy, MessageCircle, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { orders, trackingTimeline, addresses, fmtRp, STATUS_LABEL, STATUS_TONE } from "@/lib/customer-mock";
import { toast } from "sonner";

const OrderDetail = () => {
  const { id } = useParams();
  const order = orders.find((o) => o.id === id) ?? orders[0];
  const address = addresses[0];

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to="/dashboard/orders"><ArrowLeft className="h-4 w-4" />Kembali ke orders</Link>
      </Button>

      <PageHeader
        eyebrow={order.id}
        title={order.product}
        description={`Dipesan ${order.createdAt} · Estimasi sampai ${order.eta}`}
        action={
          <>
            <Button variant="outline" asChild><Link to="/whatsapp-demo"><MessageCircle className="h-4 w-4" />Tanya CS</Link></Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Tracking timeline */}
        <div className="lg:col-span-2 rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold">Tracking timeline</h2>
            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_TONE[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <span className="font-mono">{order.tracking}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(order.tracking); toast.success("Tracking number tersalin"); }}
              className="hover:text-primary"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>

          <ol className="relative space-y-5 ml-2">
            {trackingTimeline.map((t, i) => (
              <li key={i} className="flex gap-4">
                <div className="relative flex flex-col items-center">
                  <div className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${
                    t.current ? "bg-primary text-primary-foreground shadow-glow animate-pulse-soft"
                    : t.done ? "bg-success/15 text-success border-2 border-success/40"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    <Package className="h-4 w-4" />
                  </div>
                  {i < trackingTimeline.length - 1 && (
                    <div className={`w-0.5 flex-1 my-1 min-h-[20px] ${t.done ? "bg-success/40" : "bg-border"}`} />
                  )}
                </div>
                <div className={`pb-3 ${!t.done ? "opacity-50" : ""}`}>
                  <p className="font-semibold text-sm">{STATUS_LABEL[t.status]}</p>
                  <p className="text-xs text-muted-foreground">{t.at}</p>
                  {t.note && <p className="text-xs text-foreground/70 mt-1">{t.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Sidebar info */}
        <div className="space-y-5">
          <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
            <h3 className="font-display font-bold mb-4">Ringkasan biaya</h3>
            <div className="space-y-2 text-sm">
              {[
                ["Harga produk", fmtRp(1_029_000)],
                ["Fee jasa", fmtRp(154_000)],
                ["Ongkir Jepang→Indo", fmtRp(285_000)],
                ["Pajak & bea", fmtRp(124_000)],
                ["Diskon Plus", `−${fmtRp(45_000)}`],
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

          <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
            <h3 className="font-display font-bold mb-3">Dikirim ke</h3>
            <p className="text-sm font-semibold">{address.recipient}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{address.phone}</p>
            <p className="text-sm mt-2">{address.line}</p>
            <p className="text-sm text-muted-foreground">{address.city} {address.postal}</p>
          </div>

          <div className="rounded-3xl bg-secondary/50 border border-border/40 p-6">
            <h3 className="font-display font-bold mb-2">Butuh bantuan?</h3>
            <p className="text-xs text-muted-foreground mb-3">Tim CS siap bantu 24/7 lewat WhatsApp.</p>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/whatsapp-demo"><MessageCircle className="h-4 w-4" />Buka chat</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default OrderDetail;
