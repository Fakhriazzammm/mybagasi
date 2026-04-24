import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy, MessageCircle, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { OrderTimeline } from "@/components/dashboard/OrderTimeline";
import { useOrder } from "@/hooks";
import { orders as mockOrders, trackingTimeline as mockTimeline, addresses, fmtRp, STATUS_LABEL, STATUS_TONE } from "@/lib/customer-mock";
import type { OrderStatus, OrderTracking } from "@/types/database.types";
import { toast } from "sonner";

const isUuid = (value?: string) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

const asMockTracking = (): OrderTracking[] => {
  const now = Date.now();
  return mockTimeline.map((item, index) => ({
    id: `mock-${index}`,
    order_id: "mock-order",
    status: item.status,
    note: item.note ?? null,
    is_done: item.done,
    is_current: Boolean(item.current),
    occurred_at: new Date(now - (mockTimeline.length - index) * 60 * 60 * 1000).toISOString(),
    created_at: new Date(now - (mockTimeline.length - index) * 60 * 60 * 1000).toISOString(),
  }));
};

const OrderDetail = () => {
  const { id } = useParams();
  const liveMode = isUuid(id);
  const { data: orderData, isLoading } = useOrder(liveMode && id ? id : "");

  const fallbackOrder = mockOrders.find((o) => o.id === id) ?? mockOrders[0];

  const order = orderData
    ? {
        id: orderData.id,
        product: orderData.product,
        total: orderData.total,
        status: orderData.status as OrderStatus,
        createdAt: new Date(orderData.created_at).toLocaleDateString("id-ID"),
        eta: orderData.eta ? new Date(orderData.eta).toLocaleDateString("id-ID") : "-",
        tracking: orderData.tracking_number || "-",
      }
    : fallbackOrder;

  const trackingEntries = orderData?.tracking ?? asMockTracking();
  const address = addresses[0];

  const copyTracking = async () => {
    if (!order.tracking || order.tracking === "-") return;
    await navigator.clipboard.writeText(order.tracking);
    toast.success("Tracking number tersalin");
  };

  const pricingRows = orderData
    ? [
        ["Harga produk", fmtRp(Math.round((orderData.price_jpy ?? 0) * (orderData.exchange_rate ?? 0)))],
        ["Fee jasa", fmtRp(orderData.service_fee)],
        ["Ongkir Jepang -> Indonesia", fmtRp(orderData.shipping_cost)],
        ["Pajak dan bea", fmtRp(orderData.tax_customs)],
        ["Diskon membership", `-${fmtRp(orderData.membership_discount)}`],
        ["Poin dipakai", `-${fmtRp(orderData.points_used)}`],
      ]
    : [
        ["Harga produk", fmtRp(1_029_000)],
        ["Fee jasa", fmtRp(154_000)],
        ["Ongkir Jepang -> Indonesia", fmtRp(285_000)],
        ["Pajak dan bea", fmtRp(124_000)],
        ["Diskon membership", `-${fmtRp(45_000)}`],
      ];

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to="/dashboard/orders"><ArrowLeft className="h-4 w-4" />Kembali ke orders</Link>
      </Button>

      <PageHeader
        eyebrow={order.id}
        title={order.product}
        description={`Dipesan ${order.createdAt} · Estimasi sampai ${order.eta}`}
        action={<Button variant="outline" asChild><Link to="/whatsapp-demo"><MessageCircle className="h-4 w-4" />Tanya CS</Link></Button>}
      />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold">Tracking timeline realtime</h2>
            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_TONE[order.status as OrderStatus]}`}>
              {STATUS_LABEL[order.status as OrderStatus]}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <span className="font-mono">{order.tracking}</span>
            <button onClick={copyTracking} className="hover:text-primary" disabled={order.tracking === "-"}>
              <Copy className="h-3 w-3" />
            </button>
            {liveMode && <span className="text-success">Live update aktif</span>}
          </div>

          {isLoading && liveMode ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <OrderTimeline
              currentStatus={order.status as OrderStatus}
              tracking={trackingEntries}
              eta={orderData?.eta ?? null}
            />
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
            <h3 className="font-display font-bold mb-4">Ringkasan biaya</h3>
            <div className="space-y-2 text-sm">
              {pricingRows.map(([label, value]) => (
                <div key={label} className="flex justify-between text-muted-foreground">
                  <span>{label}</span>
                  <span className="text-foreground">{value}</span>
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
