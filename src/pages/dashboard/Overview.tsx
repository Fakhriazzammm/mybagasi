import { Link } from "react-router-dom";
import { ArrowRight, Crown, Coins, Heart, Bell, MessageCircle, Sparkles, Package, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { useOrders, useQuotations, useWishlist, usePriceAlerts, useUserMembership, usePoints } from "@/hooks";
import { useAuth } from "@/contexts/AuthContext";
import { fmtRp, STATUS_LABEL, STATUS_TONE } from "@/lib/format";

const SkeletonCard = () => (
  <div className="animate-pulse rounded-3xl bg-card border border-border/40 p-5 shadow-soft">
    <div className="h-11 w-11 rounded-2xl bg-secondary" />
    <div className="h-3 w-20 bg-secondary rounded mt-4" />
    <div className="h-7 w-16 bg-secondary rounded mt-1" />
  </div>
);

const Stat = ({ icon: Icon, label, value, hint, tone = "primary" }: any) => (
  <div className="rounded-3xl bg-card border border-border/40 p-5 shadow-soft">
    <div className="flex items-start justify-between">
      <div className={`h-11 w-11 rounded-2xl grid place-items-center ${tone === "primary" ? "bg-primary-soft text-primary" : "bg-secondary text-foreground"}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-4">{label}</p>
    <p className="font-display text-2xl font-bold mt-1">{value}</p>
    {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
  </div>
);

const Overview = () => {
  const { profile } = useAuth();
  const { data: orders = [], isLoading: ordersLoading, error: ordersError } = useOrders();
  const { data: quotations = [], isLoading: quotLoading } = useQuotations();
  const { data: wishlist = [], isLoading: wishLoading } = useWishlist();
  const { data: priceAlerts = [], isLoading: alertsLoading } = usePriceAlerts();
  const { data: membership, isLoading: membLoading } = useUserMembership();
  const { data: pointsBalance, isLoading: pointsLoading } = usePoints();

  const isLoading = ordersLoading || quotLoading || wishLoading || alertsLoading || membLoading || pointsLoading;

  const firstName = profile?.name?.split(" ")[0] ?? "User";

  const activeOrders = orders.filter(o => !["delivered", "cancelled", "refunded"].includes(o.status));
  const tierProgress = membership ? Math.round((membership.spent_amount / membership.target_amount) * 100) : 0;
  const nextTier = membership ? (membership.tier === "Free" ? "Plus" : membership.tier === "Plus" ? "Pro" : "Seller") : "Plus";
  const rupiahValue = pointsBalance != null ? pointsBalance * 10 : 0;

  if (ordersError) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Gagal memuat data</p>
        <p className="text-xs text-muted-foreground">{ordersError.message}</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`Konnichiwa, ${firstName} 👋`}
        title="Selamat datang kembali."
        description="Pantau quotation, order, dan keinginanmu dari Jepang di satu tempat."
        action={
          <Button variant="hero" asChild>
            <Link to="/quotation"><Sparkles className="h-4 w-4" />Buat Quotation Baru</Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Stat icon={Package} label="Order Aktif" value={activeOrders.length} hint={`${orders.length} total order`} />
          <Stat icon={FileText} label="Quotation" value={quotations.filter(q => q.status === "active").length} hint="quote masih berlaku" />
          <Stat icon={Coins} label="Poin" value={pointsBalance != null ? pointsBalance.toLocaleString("id-ID") : "0"} hint={`≈ ${fmtRp(rupiahValue)}`} />
          <Stat icon={Crown} label="Membership" value={membership?.tier ?? "Free"} hint={membership?.renews_on ? `Renew ${new Date(membership.renews_on).toLocaleDateString("id-ID")}` : ""} />
        </div>
      )}

      <div className="mt-6 grid lg:grid-cols-3 gap-5">
        {/* Active orders */}
        <div className="lg:col-span-2 rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-lg font-bold">Order yang sedang berjalan</h2>
              <p className="text-xs text-muted-foreground">Lacak realtime sampai depan rumahmu.</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard/orders">Semua <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
          {isLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-24 bg-secondary rounded-3xl" />
              <div className="h-24 bg-secondary rounded-3xl" />
            </div>
          ) : (
            <div className="space-y-3">
              {activeOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada order aktif.</p>
              ) : activeOrders.map((o) => (
                <Link
                  key={o.id}
                  to={`/dashboard/orders/${o.id}`}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-secondary/50 hover:bg-secondary transition-colors group"
                >
                  <div className="h-12 w-12 rounded-xl bg-background grid place-items-center text-primary shrink-0">
                    <Package className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{o.product}</p>
                    <p className="text-xs text-muted-foreground">{o.id.slice(0, 8)}… · ETA {o.eta ? new Date(o.eta).toLocaleDateString("id-ID") : "TBA"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_TONE[o.status] ?? "bg-muted text-muted-foreground"}`}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    <p className="text-sm font-bold mt-1">{fmtRp(o.total)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Membership progress */}
        <div className="rounded-3xl bg-gradient-coral text-primary-foreground p-6 shadow-glow relative overflow-hidden">
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_70%_20%,white,transparent_50%)]" />
          {isLoading ? (
            <div className="relative animate-pulse space-y-3">
              <div className="h-4 w-32 bg-white/20 rounded" />
              <div className="h-8 w-24 bg-white/20 rounded" />
              <div className="h-3 w-40 bg-white/20 rounded" />
              <div className="h-2 rounded-full bg-white/20" />
              <div className="h-9 w-full bg-white/20 rounded-full" />
            </div>
          ) : membership ? (
            <div className="relative">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
                <Crown className="h-4 w-4" /> Membership {membership.tier}
              </div>
              <p className="font-display text-2xl font-bold mt-3">{fmtRp(membership.target_amount - membership.spent_amount)}</p>
              <p className="text-xs opacity-80 mt-1">lagi untuk naik ke {nextTier}</p>
              <div className="mt-4 h-2 rounded-full bg-background/25 overflow-hidden">
                <div className="h-full bg-background rounded-full" style={{ width: `${Math.min(tierProgress, 100)}%` }} />
              </div>
              <div className="flex justify-between text-[11px] opacity-80 mt-1.5">
                <span>{fmtRp(membership.spent_amount)}</span>
                <span>{fmtRp(membership.target_amount)}</span>
              </div>
              <Button size="sm" className="bg-background text-foreground hover:bg-background/90 mt-5 w-full" asChild>
                <Link to="/dashboard/membership">Lihat Benefit</Link>
              </Button>
            </div>
          ) : (
            <div className="relative text-center">
              <p className="text-sm opacity-80">Membership data tidak tersedia.</p>
              <Button size="sm" className="bg-background text-foreground hover:bg-background/90 mt-5 w-full" asChild>
                <Link to="/dashboard/membership">Lihat Benefit</Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-2 gap-5">
        {/* Wishlist preview */}
        <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">Wishlist</h2>
            </div>
            <Button variant="ghost" size="sm" asChild><Link to="/dashboard/wishlist">Semua <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
          </div>
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 bg-secondary rounded-2xl" />
              ))}
            </div>
          ) : wishlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada wishlist.</p>
          ) : (
            <div className="space-y-2.5">
              {wishlist.slice(0, 3).map((w) => (
                <div key={w.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-secondary transition-colors">
                  <div className="h-11 w-11 rounded-xl bg-secondary grid place-items-center text-2xl">{w.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{w.source}</p>
                  </div>
                  <p className="text-sm font-bold">{w.price_idr ? fmtRp(w.price_idr) : "—"}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price alerts */}
        <div className="rounded-3xl bg-card border border-border/40 p-6 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">Price Alerts</h2>
            </div>
            <Button variant="ghost" size="sm" asChild><Link to="/dashboard/price-alerts">Semua <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
          </div>
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-14 bg-secondary rounded-2xl" />
              ))}
            </div>
          ) : priceAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada price alert.</p>
          ) : (
            <div className="space-y-2.5">
              {priceAlerts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-secondary transition-colors">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${a.status === "triggered" ? "bg-success animate-pulse" : "bg-warning"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{a.product}</p>
                    <p className="text-xs text-muted-foreground">Target {fmtRp(a.target_price)} · {a.last_checked_at ? new Date(a.last_checked_at).toLocaleDateString("id-ID") : "—"}</p>
                  </div>
                  <p className="text-sm font-bold">{a.current_price != null ? fmtRp(a.current_price) : "—"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-3xl bg-secondary/40 border border-border/40 p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div>
          <h3 className="font-display font-bold text-lg">Bingung pilih barang?</h3>
          <p className="text-sm text-muted-foreground">Chat AI personal shopper kami — gratis, jawab dalam detik.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/dashboard/ai-shopper"><Sparkles className="h-4 w-4" />AI Shopper</Link></Button>
          <Button variant="hero" asChild><Link to="/dashboard/ai-shopper"><MessageCircle className="h-4 w-4" />WhatsApp</Link></Button>
        </div>
      </div>
    </>
  );
};

export default Overview;
