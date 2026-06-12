import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Package, ArrowRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { fmtRp, STATUS_LABEL, STATUS_TONE } from "@/lib/format";

interface DashboardOrder {
  id: string;
  order_number: string;
  status: string;
  status_emoji: string;
  status_label: string;
  items_summary: string;
  total: number;
  total_display: string;
  created_at: string;
}

const Orders = () => {
  const { username } = useParams<{ username: string }>();
  const { profile } = useAuth();
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.telegram_id) {
      setLoading(false);
      setError(null);
      return;
    }

    const abortController = new AbortController();

    const fetchOrders = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/orders/dashboard?telegram_id=${profile.telegram_id}`,
          { signal: abortController.signal }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        setOrders(Array.isArray(data) ? data : data?.data ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Gagal memuat data pesanan");
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();

    return () => abortController.abort();
  }, [profile?.telegram_id]);

  if (error) {
    return (
      <>
        <PageHeader
          eyebrow="Orders"
          title="Riwayat pesanan"
          description="Semua orderanmu dari Jepang — status terupdate realtime."
        />
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Orders"
        title="Riwayat pesanan"
        description="Semua orderanmu dari Jepang — status terupdate realtime."
      />

      <div className="rounded-3xl bg-card border border-border/40 shadow-soft overflow-hidden">
        <div className="divide-y divide-border/40">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 animate-pulse">
                  <div className="h-14 w-14 rounded-2xl bg-secondary" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-secondary rounded" />
                    <div className="h-3 w-32 bg-secondary rounded" />
                  </div>
                  <div className="h-4 w-20 bg-secondary rounded" />
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
              <p className="font-medium">Belum ada pesanan.</p>
              <p className="text-sm mt-1">Mulai belanja dari Jepang!</p>
            </div>
          ) : (
            orders.map((o) => (
              <Link
                key={o.id}
                to={`/${username}/orders/${o.id}`}
                className="flex items-center gap-4 p-5 hover:bg-secondary/30 transition-colors"
              >
                <div className="h-14 w-14 rounded-2xl bg-secondary grid place-items-center text-primary shrink-0">
                  <Package className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">
                      {o.status_emoji} {o.order_number}
                    </p>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        STATUS_TONE[o.status] || "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[o.status] || o.status_label || o.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {o.items_summary}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(o.created_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm">{fmtRp(o.total)}</p>
                  <Button variant="ghost" size="sm" className="mt-1 -mr-2">
                    Detail <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default Orders;
