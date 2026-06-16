import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAllSchedulesWithShoppers, useJoinBatch, useShopperSchedules } from "@/hooks";
import { personalShoppersService } from '@/services/personal-shoppers.service'
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock, LayoutGrid, List, Plane, ShieldCheck, Store, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from 'framer-motion'
import ScheduleCalendarView from '@/components/marketplace/ScheduleCalendarView'
import type { BatchShipmentWithShoppers } from '@/types/database.types'

const statusTone: Record<string, string> = {
  open: "bg-success/15 text-success",
  closing_soon: "bg-warning/15 text-warning",
  closed: "bg-muted text-muted-foreground",
  shipping: "bg-primary-soft text-primary",
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

export default function BatchShipping() {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [selectedShopper, setSelectedShopper] = useState<string | null>(null)
  const [shoppers, setShoppers] = useState<any[]>([])
  const [shoppersLoading, setShoppersLoading] = useState(true)

  // Ambil daftar personal shopper untuk filter
  useEffect(() => {
    personalShoppersService.list().then(data => {
      setShoppers(data)
      setShoppersLoading(false)
    }).catch(() => setShoppersLoading(false))
  }, [])

  // Query berdasarkan filter
  const { data: allSchedules = [], isLoading: allLoading, error: allError } = useAllSchedulesWithShoppers()
  const { data: shopperSchedules = [], isLoading: shopperLoading, error: shopperError } = useShopperSchedules(selectedShopper ?? undefined)

  const isLoading = selectedShopper ? shopperLoading : allLoading
  const error = selectedShopper ? shopperError : allError
  const batches = selectedShopper ? shopperSchedules : allSchedules
  
  const joinBatch = useJoinBatch();

  const jpToId = batches.filter((b: any) => b.direction === "japan_to_indonesia");
  const idToJp = batches.filter((b: any) => b.direction === "indonesia_to_japan");

  const renderCard = (b: any) => {
    const joined = b.participants?.[0]?.count ?? 0;
    const fillPct = b.capacity > 0 ? Math.round((joined / b.capacity) * 100) : 0;
    const weightUsed = b.participants?.[0]?.total_weight ?? 0;
    const weightPct = b.max_weight_kg > 0 ? Math.round((weightUsed / b.max_weight_kg) * 100) : 0;
    const isActive = b.status === "open" || b.status === "closing_soon";

    return (
      <Card key={b.id} className="border-border/60 overflow-hidden">
        <CardContent className="p-0">
          <div className="p-3.5 sm:p-4">
            {/* Row 1: Badge + Direction */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Badge className={`${statusTone[b.status] ?? "bg-muted"} text-[10px] px-2 py-0.5`}>
                  {statusLabel[b.status] ?? b.status}
                </Badge>
                {b.direction && (
                  <span className="text-xs text-muted-foreground font-medium">{dirLabel[b.direction]}</span>
                )}
              </div>
              {isActive && b.closes_at && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Tutup {new Date(b.closes_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>
                </div>
              )}
            </div>

            {/* Row 2: Nama */}
            <h3 className="font-display font-bold text-sm sm:text-base mb-2.5">{b.name}</h3>

            {/* Row 3: Tanggal */}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-3 flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-primary" />
                Berangkat {new Date(b.departure_date || b.closes_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
              </span>
              {b.route && (
                <span className="text-border">|</span>
              )}
              {b.route && (
                <span className="flex items-center gap-1">
                  {b.route}
                </span>
              )}
            </div>

            {/* Row 4: Stats mini */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5 bg-secondary/60 rounded-lg px-2.5 py-1.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-semibold">{joined}/{b.capacity}</span>
                <span className="text-[9px] text-muted-foreground">org</span>
              </div>
              <div className="flex items-center gap-1.5 bg-secondary/60 rounded-lg px-2.5 py-1.5">
                <span className="text-xs font-semibold">{b.max_weight_kg || "—"}kg</span>
                <span className="text-[9px] text-muted-foreground">slot</span>
              </div>
              <div className="flex items-center gap-1.5 bg-secondary/60 rounded-lg px-2.5 py-1.5">
                <span className="text-xs font-semibold">¥{Number(b.price_per_kg).toLocaleString()}</span>
                <span className="text-[9px] text-muted-foreground">/kg</span>
              </div>
              {b.savings_percent > 0 && (
                <div className="flex items-center gap-1.5 bg-success/10 text-success rounded-lg px-2.5 py-1.5">
                  <span className="text-xs font-semibold">-{b.savings_percent}%</span>
                </div>
              )}
            </div>

            {/* Row 5: Progress compact */}
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground w-8">Slot</span>
                <Progress value={fillPct} className="h-1.5 flex-1" />
                <span className="text-[10px] font-semibold w-8 text-right">{fillPct}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground w-8">Berat</span>
                <Progress value={weightPct} className="h-1.5 flex-1" />
                <span className="text-[10px] font-semibold w-8 text-right">{weightPct}%</span>
              </div>
            </div>

            {/* Row 6: CTA */}
            <div className="flex items-center justify-between pt-2.5 border-t border-border/40">
              <span className="text-[10px] text-muted-foreground">{joined} peserta</span>
              <Button
                variant={isActive ? "hero" : "outline"}
                size="sm"
                disabled={!isActive || joinBatch.isPending}
                onClick={() => {
                  joinBatch.mutate(
                    { batch_id: b.id, items: 1, weight_kg: 1 },
                    {
                      onSuccess: () => toast.success("Berhasil gabung!"),
                      onError: (e) => toast.error("Gagal", { description: (e as Error).message }),
                    }
                  );
                }}
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-10 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-secondary/50 rounded-2xl animate-pulse" />
          ))}
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-20 text-center text-sm text-destructive">
          Gagal memuat data. Coba refresh.
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        {/* Mini hero */}
        <div className="bg-gradient-hero border-b border-border/60">
          <div className="container mx-auto px-4 py-5 sm:py-7">
            <h1 className="font-display font-bold text-lg sm:text-2xl">
              Jadwal <span className="text-primary">Pengiriman</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Kirim & terima barang Indonesia ↔ Jepang
            </p>

            {/* ── Filter Shopper ───────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <button
                onClick={() => setSelectedShopper(null)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  !selectedShopper
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Semua
              </button>
              {shoppers.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedShopper(s.slug)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedShopper === s.slug
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {s.verification === 'gold' ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                  ) : s.verification === 'blue' ? (
                    <UserCheck className="h-3.5 w-3.5 text-blue-400" />
                  ) : (
                    <Store className="h-3.5 w-3.5" />
                  )}
                  {s.name}
                </button>
              ))}
            </div>

            {/* ── View Toggle ───────────────────────────────────── */}
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5 w-fit mt-3">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  viewMode === 'calendar' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Calendar className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Content ──────────────────────────────────────── */}
        <div className="container mx-auto px-4 py-5 max-w-3xl">
          {viewMode === 'calendar' ? (
            <ScheduleCalendarView schedules={batches} />
          ) : (
            <div className="space-y-6">
              {[jpToId, idToJp].map((items, idx) => {
                if (!items.length) return null
                return (
                  <section key={idx}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-display font-bold">
                        {idx === 0 ? dirTitle.japan_to_indonesia : dirTitle.indonesia_to_japan}
                      </span>
                      <span className="text-[10px] text-muted-foreground">({items.length})</span>
                    </div>
                    <div className="space-y-3">
                      {items.map(renderCard)}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
