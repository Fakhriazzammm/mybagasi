import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import type { OrderStatus, OrderTracking } from "@/types/database.types";
import { STATUS_LABEL } from "@/lib/order-status";

const ORDER_STAGES: OrderStatus[] = [
  "quote_created",
  "paid",
  "procurement_queue",
  "purchased",
  "in_japan_warehouse",
  "packed",
  "shipped_to_indonesia",
  "customs_clearance",
  "last_mile_delivery",
  "delivered",
];

type TimelineItem = {
  status: OrderStatus;
  done: boolean;
  current: boolean;
  note?: string;
  at?: string;
  etaText?: string;
};

interface OrderTimelineProps {
  currentStatus: OrderStatus;
  tracking?: OrderTracking[];
  eta?: string | null;
}

const formatDateTime = (iso?: string | null): string | undefined => {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
};

const formatRelativeEta = (target?: Date | null, now = new Date()): string | undefined => {
  if (!target || Number.isNaN(target.getTime())) return undefined;
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return "estimasi saat ini";
  const hours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (hours < 24) return `estimasi ${hours} jam lagi`;
  const days = Math.ceil(hours / 24);
  return `estimasi ${days} hari lagi`;
};

export const OrderTimeline = ({ currentStatus, tracking = [], eta }: OrderTimelineProps) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const timeline = useMemo<TimelineItem[]>(() => {
    const stageIndex = ORDER_STAGES.indexOf(currentStatus);
    const currentIndex = stageIndex >= 0 ? stageIndex : 0;

    const byStatus = new Map<OrderStatus, OrderTracking>();
    tracking.forEach((entry) => {
      byStatus.set(entry.status, entry);
    });

    const etaDate = eta ? new Date(eta) : null;
    const remainingStages = Math.max(1, ORDER_STAGES.length - currentIndex - 1);

    return ORDER_STAGES.map((status, index) => {
      const hit = byStatus.get(status);
      const done = Boolean(hit?.is_done) || index < currentIndex;
      const current = Boolean(hit?.is_current) || index === currentIndex;

      let etaText: string | undefined;
      if (!done && etaDate && !Number.isNaN(etaDate.getTime())) {
        const ratio = (index - currentIndex + 1) / (remainingStages + 1);
        const projected = new Date(now.getTime() + (etaDate.getTime() - now.getTime()) * ratio);
        etaText = formatRelativeEta(projected, now);
      }

      return {
        status,
        done,
        current,
        note: hit?.note ?? undefined,
        at: formatDateTime(hit?.occurred_at),
        etaText,
      };
    });
  }, [currentStatus, tracking, eta, now]);

  return (
    <ol className="relative space-y-5 ml-2">
      {timeline.map((item, index) => (
        <li key={item.status} className="flex gap-4">
          <div className="relative flex flex-col items-center">
            <div
              className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${
                item.current
                  ? "bg-primary text-primary-foreground shadow-glow animate-pulse-soft"
                  : item.done
                    ? "bg-success/15 text-success border-2 border-success/40"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <Package className="h-4 w-4" />
            </div>
            {index < timeline.length - 1 && (
              <div className={`w-0.5 flex-1 my-1 min-h-[20px] ${item.done ? "bg-success/40" : "bg-border"}`} />
            )}
          </div>

          <div className={`pb-3 ${!item.done && !item.current ? "opacity-60" : ""}`}>
            <p className="font-semibold text-sm">{STATUS_LABEL[item.status]}</p>
            {item.at && <p className="text-xs text-muted-foreground">{item.at}</p>}
            {!item.at && item.etaText && <p className="text-xs text-muted-foreground">{item.etaText}</p>}
            {item.note && <p className="text-xs text-foreground/70 mt-1">{item.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
};
