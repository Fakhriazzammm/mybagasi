import { useState } from "react";
import { Link } from "react-router-dom";
import { Package, ArrowRight, Search, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrders } from "@/hooks";
import { fmtRp, STATUS_LABEL, STATUS_TONE } from "@/lib/customer-mock";
import type { OrderStatus } from "@/types/database.types";

const Orders = () => {
  const [search, setSearch] = useState("");
  const { data: orders = [], isLoading } = useOrders();

  const filtered = orders.filter(
    (o) =>
      o.product.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageHeader
        eyebrow="Orders"
        title="Riwayat pesanan"
        description="Semua orderanmu dari Jepang — status terupdate realtime."
      />

      <div className="rounded-3xl bg-card border border-border/40 shadow-soft overflow-hidden">
        <div className="p-4 border-b border-border/60 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari order ID atau produk..."
              className="pl-9 rounded-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm">Semua</Button>
            <Button variant="ghost" size="sm">Aktif</Button>
            <Button variant="ghost" size="sm">Selesai</Button>
          </div>
        </div>

        <div className="divide-y divide-border/40">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              {search ? "Tidak ada order yang cocok." : "Belum ada order."}
            </div>
          ) : (
            filtered.map((o) => (
              <Link
                key={o.id}
                to={`/dashboard/orders/${o.id}`}
                className="flex items-center gap-4 p-5 hover:bg-secondary/30 transition-colors"
              >
                <div className="h-14 w-14 rounded-2xl bg-secondary grid place-items-center text-primary shrink-0">
                  <Package className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{o.product}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_TONE[o.status as OrderStatus]}`}>
                      {STATUS_LABEL[o.status as OrderStatus]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {o.id.slice(0, 8)}… · Dipesan {new Date(o.created_at).toLocaleDateString("id-ID")}
                    {o.eta && ` · ETA ${new Date(o.eta).toLocaleDateString("id-ID")}`}
                  </p>
                  {o.tracking_number && (
                    <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                      📦 {o.tracking_number}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold">{fmtRp(o.total)}</p>
                  <Button variant="ghost" size="sm" className="mt-1 -mr-2">
                    Lacak <ArrowRight className="h-3.5 w-3.5" />
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
