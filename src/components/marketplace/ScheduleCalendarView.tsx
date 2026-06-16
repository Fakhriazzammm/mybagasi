import { useMemo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Calendar, ChevronLeft, ChevronRight, Plane, Users, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScheduleItem {
  id: string;
  name: string;
  route: string;
  direction: "japan_to_indonesia" | "indonesia_to_japan";
  departure_date: string;
  closes_at: string;
  arrives_at: string | null;
  capacity: number;
  max_weight_kg: number;
  price_per_kg: number;
  savings_percent: number;
  status: "open" | "closing_soon" | "closed" | "shipping";
  shoppers?: {
    name: string;
    slug: string;
    avatar_url: string | null;
    verification: string;
    is_primary?: boolean;
  }[];
  participants?: { count: number }[];
}

export interface ScheduleCalendarViewProps {
  schedules: ScheduleItem[];
  onJoin?: (schedule: ScheduleItem) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const statusTone: Record<string, string> = {
  open: "bg-success/15 text-success",
  closing_soon: "bg-warning/15 text-warning",
  closed: "bg-muted text-muted-foreground",
  shipping: "bg-primary-soft text-primary",
};

const statusToneDot: Record<string, string> = {
  open: "bg-success",
  closing_soon: "bg-warning",
  closed: "bg-muted-foreground/40",
  shipping: "bg-primary",
};

const statusLabel: Record<string, string> = {
  open: "Buka",
  closing_soon: "⚠️ Segera Tutup",
  closed: "Tutup",
  shipping: "Dikirim",
};

const dirLabel: Record<string, string> = {
  indonesia_to_japan: "🇮🇩→🇯🇵",
  japan_to_indonesia: "🇯🇵→🇮🇩",
};

const dirTitle: Record<string, string> = {
  indonesia_to_japan: "Indonesia → Jepang",
  japan_to_indonesia: "Jepang → Indonesia",
};

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMonthGrid(year: number, month: number): (number | null)[][] {
  // Indonesia locale: Monday first
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun, 1=Mon...
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = firstDay === 0 ? 6 : firstDay - 1; // shift so Monday=0

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = [];

  for (let i = 0; i < offset; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function formatMonthYear(year: number, month: number): string {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isToday(year: number, month: number, day: number): boolean {
  const now = new Date();
  return (
    now.getFullYear() === year &&
    now.getMonth() === month &&
    now.getDate() === day
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScheduleCalendarView({
  schedules,
  onJoin,
}: ScheduleCalendarViewProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // ── date → schedules mapping ──
  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const s of schedules) {
      const dateKey = s.departure_date?.split("T")[0];
      if (!dateKey) continue;
      const existing = map.get(dateKey) ?? [];
      existing.push(s);
      map.set(dateKey, existing);
    }
    return map;
  }, [schedules]);

  // schedules visible in current month
  const monthSchedules = useMemo(() => {
    const prefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    return schedules.filter((s) => {
      const d = s.departure_date?.split("T")[0];
      return d?.startsWith(prefix);
    });
  }, [schedules, currentYear, currentMonth]);

  // selected schedule(s)
  const selectedSchedules = selectedDate
    ? scheduleMap.get(selectedDate) ?? []
    : monthSchedules;

  const weeks = useMemo(
    () => getMonthGrid(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  const navigate = useCallback((dir: "prev" | "next") => {
    setCurrentMonth((m) => {
      const next = dir === "next" ? m + 1 : m - 1;
      if (next < 0) {
        setCurrentYear((y) => y - 1);
        return 11;
      }
      if (next > 11) {
        setCurrentYear((y) => y + 1);
        return 0;
      }
      return next;
    });
    setSelectedDate(null);
  }, []);

  // ── Render schedule card (mirrors BatchShipping.tsx) ──
  const renderScheduleCard = (s: ScheduleItem) => {
    const joined = s.participants?.[0]?.count ?? 0;
    const fillPct =
      s.capacity > 0 ? Math.round((joined / s.capacity) * 100) : 0;
    const weightUsed = 0; // simplified — no total_weight in ScheduleItem
    const weightPct = s.max_weight_kg > 0 ? 0 : 0;
    const isActive = s.status === "open" || s.status === "closing_soon";

    return (
      <Card key={s.id} className="border-border/60 overflow-hidden">
        <CardContent className="p-0">
          <div className="p-3.5 sm:p-4">
            {/* Row 1: Badge + Direction */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Badge
                  className={`${statusTone[s.status] ?? "bg-muted"} text-[10px] px-2 py-0.5`}
                >
                  {statusLabel[s.status] ?? s.status}
                </Badge>
                {s.direction && (
                  <span className="text-xs text-muted-foreground font-medium">
                    {dirLabel[s.direction]}
                  </span>
                )}
              </div>
              {isActive && s.closes_at && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    Tutup{" "}
                    {new Date(s.closes_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* Row 2: Nama */}
            <h3 className="font-display font-bold text-sm sm:text-base mb-2.5">
              {s.name}
            </h3>

            {/* Row 3: Tanggal & Rute */}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-3 flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-primary" />
                Berangkat{" "}
                {new Date(s.departure_date || s.closes_at).toLocaleDateString(
                  "id-ID",
                  { day: "numeric", month: "short" }
                )}
              </span>
              {s.route && <span className="text-border">|</span>}
              {s.route && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {s.route}
                </span>
              )}
            </div>

            {/* ── Personal Shopper ───────────────────────────── */}
            {s.shoppers && s.shoppers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <span className="text-[10px] text-muted-foreground mr-0.5">🛍</span>
                {s.shoppers.map((sh: any) => (
                  <Link
                    key={sh.slug}
                    to={`/marketplace/${sh.slug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/50 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    {sh.verification === 'gold' ? '⭐' : sh.verification === 'blue' ? '✅' : ''}
                    <span className={sh.is_primary ? 'font-semibold' : ''}>{sh.name}</span>
                    {sh.is_primary && (
                      <span className="text-[8px] px-1 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Host</span>
                    )}
                  </Link>
                ))}
              </div>
            )}

            {/* Row 4: Stats */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5 bg-secondary/60 rounded-lg px-2.5 py-1.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-semibold">
                  {joined}/{s.capacity}
                </span>
                <span className="text-[9px] text-muted-foreground">org</span>
              </div>
              <div className="flex items-center gap-1.5 bg-secondary/60 rounded-lg px-2.5 py-1.5">
                <span className="text-xs font-semibold">
                  {s.max_weight_kg || "—"}kg
                </span>
                <span className="text-[9px] text-muted-foreground">slot</span>
              </div>
              <div className="flex items-center gap-1.5 bg-secondary/60 rounded-lg px-2.5 py-1.5">
                <span className="text-xs font-semibold">
                  ¥{Number(s.price_per_kg).toLocaleString()}
                </span>
                <span className="text-[9px] text-muted-foreground">/kg</span>
              </div>
              {s.savings_percent > 0 && (
                <div className="flex items-center gap-1.5 bg-success/10 text-success rounded-lg px-2.5 py-1.5">
                  <span className="text-xs font-semibold">
                    -{s.savings_percent}%
                  </span>
                </div>
              )}
            </div>

            {/* Row 5: Progress */}
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground w-8">
                  Slot
                </span>
                <Progress value={fillPct} className="h-1.5 flex-1" />
                <span className="text-[10px] font-semibold w-8 text-right">
                  {fillPct}%
                </span>
              </div>
              {weightPct > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground w-8">
                    Berat
                  </span>
                  <Progress value={weightPct} className="h-1.5 flex-1" />
                  <span className="text-[10px] font-semibold w-8 text-right">
                    {weightPct}%
                  </span>
                </div>
              )}
            </div>

            {/* Row 6: CTA */}
            <div className="flex items-center justify-between pt-2.5 border-t border-border/40">
              <span className="text-[10px] text-muted-foreground">
                {joined} peserta
              </span>
              <Button
                variant={isActive ? "hero" : "outline"}
                size="sm"
                disabled={!isActive}
                onClick={() => onJoin?.(s)}
                className="h-7 text-xs gap-1"
              >
                <Plane className="h-3 w-3" />
                {isActive ? "Gabung" : "Tutup"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── Shopper avatars for a date ──
  const renderShoppers = (schedules: ScheduleItem[]) => {
    // Collect unique shoppers across all schedules on this date
    const shoppers = schedules
      .flatMap((s) => s.shoppers ?? [])
      .filter(
        (s, i, arr) => arr.findIndex((a) => a.slug === s.slug) === i
      );
    if (!shoppers.length) return null;

    return (
      <div className="flex -space-x-2 mt-1">
        {shoppers.slice(0, 3).map((shopper) => (
          <div
            key={shopper.slug}
            className={cn(
              "w-5 h-5 rounded-full border-2 border-background overflow-hidden",
              "flex items-center justify-center text-[8px] font-semibold"
            )}
            title={shopper.name}
          >
            {shopper.avatar_url ? (
              <img
                src={shopper.avatar_url}
                alt={shopper.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="bg-primary/20 text-primary w-full h-full flex items-center justify-center">
                {shopper.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        ))}
        {shoppers.length > 3 && (
          <div className="w-5 h-5 rounded-full border-2 border-background bg-secondary text-[8px] font-semibold flex items-center justify-center text-muted-foreground">
            +{shoppers.length - 3}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── Calendar Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-base sm:text-lg">
          <Calendar className="h-4 w-4 inline-block mr-2 text-primary" />
          Kalender Keberangkatan
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("prev")}
            className="h-8 w-8"
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-display font-semibold min-w-[140px] text-center">
            {formatMonthYear(currentYear, currentMonth)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("next")}
            className="h-8 w-8"
            aria-label="Bulan berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Calendar Grid ── */}
      <div className="bg-card border border-border/60 shadow-soft rounded-2xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border/40">
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="py-2 text-center text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="divide-y divide-border/30">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day, di) => {
                if (day === null) {
                  return (
                    <div
                      key={`empty-${wi}-${di}`}
                      className="min-h-[64px] sm:min-h-[80px] bg-muted/20"
                    />
                  );
                }

                const dateKey = formatDate(currentYear, currentMonth, day);
                const daySchedules = scheduleMap.get(dateKey) ?? [];
                const hasSchedule = daySchedules.length > 0;
                const isActive = selectedDate === dateKey;
                const isHovered = hoveredDate === dateKey;
                const todayFlag = isToday(currentYear, currentMonth, day);

                // Determine dot color: use the most urgent status
                const dotColor = hasSchedule
                  ? statusToneDot[
                      [...daySchedules].sort((a, b) => {
                        const order = [
                          "closing_soon",
                          "open",
                          "shipping",
                          "closed",
                        ];
                        return (
                          order.indexOf(a.status) - order.indexOf(b.status)
                        );
                      })[0]?.status ?? "open"
                    ] ?? "bg-success"
                  : null;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() =>
                      setSelectedDate(
                        isActive ? null : dateKey
                      )
                    }
                    onMouseEnter={() => setHoveredDate(dateKey)}
                    onMouseLeave={() => setHoveredDate(null)}
                    className={cn(
                      "relative min-h-[64px] sm:min-h-[80px] p-1.5 sm:p-2",
                      "text-left transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset",
                      "hover:bg-accent/30 cursor-pointer",
                      isActive && "bg-accent/50 ring-2 ring-primary/20 ring-inset",
                      isHovered && !isActive && "bg-accent/20",
                      !hasSchedule && "opacity-60"
                    )}
                  >
                    {/* Date number */}
                    <span
                      className={cn(
                        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold",
                        todayFlag && "bg-primary text-primary-foreground",
                        !todayFlag && "text-foreground"
                      )}
                    >
                      {day}
                    </span>

                    {/* Dot indicator */}
                    {dotColor && (
                      <div
                        className={cn(
                          "absolute top-1.5 right-1.5 sm:top-2 sm:right-2",
                          "w-1.5 h-1.5 rounded-full",
                          dotColor
                        )}
                      />
                    )}

                    {/* Shopper avatars (compact) */}
                    {hasSchedule && daySchedules.length <= 2 && (
                      <div className="mt-0.5 sm:mt-1">
                        {renderShoppers(daySchedules)}
                      </div>
                    )}

                    {/* Schedule count badge */}
                    {hasSchedule && (
                      <div className="mt-0.5 sm:mt-1">
                        <span className="text-[8px] sm:text-[9px] text-muted-foreground">
                          {daySchedules.length} jadwal
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Schedule Detail Section ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-sm sm:text-base">
            {selectedDate
              ? `Jadwal ${new Date(
                  selectedDate + "T00:00:00"
                ).toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}`
              : `Semua Jadwal ${formatMonthYear(currentYear, currentMonth)}`}
          </h3>
          <span className="text-[10px] text-muted-foreground">
            {selectedSchedules.length} jadwal
          </span>
        </div>

        {selectedSchedules.length === 0 ? (
          <div className="bg-card border border-border/60 shadow-soft rounded-2xl p-8 text-center">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground">
              {selectedDate
                ? "Tidak ada jadwal di tanggal ini"
                : "Tidak ada jadwal di bulan ini"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedSchedules.map(renderScheduleCard)}
          </div>
        )}
      </div>
    </div>
  );
}
