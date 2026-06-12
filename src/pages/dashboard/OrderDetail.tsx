import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy, MessageCircle, ExternalLink, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Order status cycle (matches scraper backend)
const ORDER_STATUSES = [
  "dipesan",
  "dicari",
  "dibeli",
  "di_gudang_jp",
  "dikirim",
  "di_gudang_id",
  "dikemas",
  "dikirim_ke_user",
  "selesai",
  "batal",
];

const STATUS_EMOJI: Record<string, string> = {
  dipesan: "🆕",
  dicari: "🔍",
  dibeli: "🛒",
  di_gudang_jp: "📦",
  dikirim: "✈️",
  di_gudang_id: "🏭",
  dikemas: "📦",
  dikirim_ke_user: "🚚",
  selesai: "✅",
  batal: "❌",
};

const STATUS_LABEL: Record<string, string> = {
  dipesan: "Dipesan",
  dicari: "Dicari di Store Jepang",
  dibeli: "Sudah Dibeli di Jepang",
  di_gudang_jp: "Sampai di Gudang Jepang",
  dikirim: "Dikirim ke Indonesia",
  di_gudang_id: "Sampai di Gudang Indonesia",
  dikemas: "Dikemas untuk Dikirim",
  dikirim_ke_user: "Dikirim ke Kamu",
  selesai: "Selesai",
  batal: "Dibatalkan",
};

const OrderDetail = () => {
  const { id } = useParams();
  const { profile, getDashboardRoute } = useAuth();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !profile?.telegram_id) return;

    const fetchOrder = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/orders/dashboard?telegram_id=${profile.telegram_id}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.detail ?? "Gagal memuat data");

        const found = (json.orders ?? []).find((o: any) => o.id === id);
        if (!found) {
          setOrder(null);
        } else {
          setOrder(found);
        }
      } catch (err: any) {
        setError(err.message ?? "Terjadi kesalahan");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [id, profile?.telegram_id]);

  if (!getDashboardRoute) {
    return null;
  }

  if (loading) {
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
        <p className="text-xs text-muted-foreground">{error}</p>
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

  const currentStatusIdx = ORDER_STATUSES.indexOf(order.status);
  const timelineMap = new Map<string, any>();
  (order.timeline ?? []).forEach((t: any) => timelineMap.set(t.status, t));

  // Build full timeline from status cycle + overlay scraper data
  const fullTimeline = ORDER_STATUSES.map((status, idx) => {
    const entry = timelineMap.get(status);
    return {
      status,
      emoji: entry?.emoji ?? STATUS_EMOJI[status] ?? "📌",
      label: entry?.label ?? STATUS_LABEL[status] ?? status,
      note: entry?.note ?? "",
      at: entry?.at ?? null,
      isDone: idx < currentStatusIdx || status === "batal",
      isCurrent: idx === currentStatusIdx,
      isFuture: idx > currentStatusIdx && status !== "batal",
    };
  });

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to={getDashboardRoute() + "/orders"}>
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Link>
      </Button>

      <PageHeader
        eyebrow={order.order_number || order.id}
        title={`${order.status_emoji ?? ""} ${order.status_label ?? order.status}`}
        description={`Dipesan ${order.created_at ? new Date(order.created_at).toLocaleDateString("id-ID") : "—"}`}
        action={
          <>
            <Button variant="outline" asChild>
              <Link to={getDashboardRoute() + "/ai-shopper"}>
                <MessageCircle className="h-4 w-4" />
                Tanya CS
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Tracking timeline */}
        <div className="lg:col-span-2 rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold">Tracking timeline</h2>
            <span className="text-[10px] px-2 py-1 rounded-full font-semibold bg-primary/10 text-primary">
              {order.status_emoji} {order.status_label}
            </span>
          </div>
          {order.tracking_number && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
              <span className="font-mono">{order.tracking_number}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(order.tracking_number ?? "");
                  toast.success("Tracking number tersalin");
                }}
                className="hover:text-primary"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}

          {fullTimeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada tracking timeline.</p>
          ) : (
            <ol className="relative space-y-5 ml-2">
              {fullTimeline.map((item, idx) => (
                <li key={item.status} className="flex gap-4">
                  <div className="relative flex flex-col items-center">
                    <div
                      className={`h-9 w-9 rounded-full grid place-items-center shrink-0 text-sm ${
                        item.isCurrent
                          ? "bg-primary text-primary-foreground shadow-glow animate-pulse-soft"
                          : item.isDone
                            ? "bg-success/15 text-success border-2 border-success/40"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {item.emoji}
                    </div>
                    {idx < fullTimeline.length - 1 && (
                      <div
                        className={`w-0.5 flex-1 my-1 min-h-[20px] ${
                          item.isDone ? "bg-success/40" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                  <div
                    className={`pb-3 ${item.isFuture ? "opacity-50" : ""}`}
                  >
                    <p className="font-semibold text-sm">
                      {item.emoji} {item.label}
                    </p>
                    {item.note && (
                      <p className="text-xs text-foreground/70 mt-1">
                        {item.note}
                      </p>
                    )}
                    {item.at && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        🕐 {formatDateTime(item.at)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Sidebar info */}
        <div className="space-y-5">
          {/* Items */}
          <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
            <h3 className="font-display font-bold mb-4">Item pesanan</h3>
            {order.items && order.items.length > 0 ? (
              <ul className="space-y-3 text-sm">
                {order.items.map((item: any, i: number) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {item.name}
                      <span className="ml-1 text-xs">×{item.qty}</span>
                    </span>
                    <span className="text-foreground font-medium">
                      ¥{Number(item.price_jpy ?? 0).toLocaleString("ja-JP")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{order.items_summary ?? "—"}</p>
            )}
          </div>

          {/* Total */}
          <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
            <h3 className="font-display font-bold mb-4">Total dibayar</h3>
            <p className="text-2xl font-bold text-primary">
              {order.total_display ?? `Rp${Number(order.total_idr ?? 0).toLocaleString("id-ID")}`}
            </p>
            {order.invoice_url && (
              <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                <a href={order.invoice_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Lihat invoice
                </a>
              </Button>
            )}
          </div>

          {/* Butuh bantuan */}
          <div className="rounded-3xl bg-secondary/50 border border-border/40 p-6">
            <h3 className="font-display font-bold mb-2">Butuh bantuan?</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Tim CS siap bantu 24/7 lewat WhatsApp.
            </p>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to={getDashboardRoute() + "/ai-shopper"}>
                <MessageCircle className="h-4 w-4" />
                Buka chat
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default OrderDetail;
