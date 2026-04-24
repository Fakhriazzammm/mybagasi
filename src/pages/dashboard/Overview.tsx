import { Link } from "react-router-dom";
import { ArrowRight, Crown, Coins, Heart, Bell, MessageCircle, Sparkles, Package, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { customer, orders, quotations, wishlist, priceAlerts, fmtRp, STATUS_LABEL, STATUS_TONE } from "@/lib/customer-mock";
import type { LucideIcon } from "lucide-react";

type StatProps = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "primary" | "secondary";
};

const Stat = ({ icon: Icon, label, value, hint, tone = "primary" }: StatProps) => (
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
  const activeOrders = orders.filter(o => !["delivered", "cancelled", "refunded"].includes(o.status));
  const tierProgress = Math.round((customer.membership.spent / customer.membership.target) * 100);

  return (
    <>
      <PageHeader
        eyebrow={`Konnichiwa, ${customer.name.split(" ")[0]} 👋`}
        title="Selamat datang kembali."
        description="Pantau quotation, order, dan keinginanmu dari Jepang di satu tempat."
        action={
          <Button variant="hero" asChild>
            <Link to="/quotation"><Sparkles className="h-4 w-4" />Buat Quotation Baru</Link>
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat icon={Package} label="Order Aktif" value={activeOrders.length} hint={`${orders.length} total order`} />
        <Stat icon={FileText} label="Quotation" value={quotations.filter(q => q.status === "active").length} hint="quote masih berlaku" />
        <Stat icon={Coins} label="Poin" value={customer.points.balance.toLocaleString("id-ID")} hint={`≈ ${fmtRp(customer.points.rupiahValue)}`} />
        <Stat icon={Crown} label="Membership" value={customer.membership.tier} hint={`Renew ${customer.membership.renewsOn}`} />
      </div>

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
                  <p className="text-xs text-muted-foreground">{o.id} · ETA {o.eta}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_TONE[o.status]}`}>
                    {STATUS_LABEL[o.status]}
                  </span>
                  <p className="text-sm font-bold mt-1">{fmtRp(o.total)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Membership progress */}
        <div className="rounded-3xl bg-gradient-coral text-primary-foreground p-6 shadow-glow relative overflow-hidden">
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_70%_20%,white,transparent_50%)]" />
          <div className="relative">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
              <Crown className="h-4 w-4" /> Membership {customer.membership.tier}
            </div>
            <p className="font-display text-2xl font-bold mt-3">{fmtRp(customer.membership.target - customer.membership.spent)}</p>
            <p className="text-xs opacity-80 mt-1">lagi untuk naik ke {customer.membership.nextTier}</p>
            <div className="mt-4 h-2 rounded-full bg-background/25 overflow-hidden">
              <div className="h-full bg-background rounded-full" style={{ width: `${tierProgress}%` }} />
            </div>
            <div className="flex justify-between text-[11px] opacity-80 mt-1.5">
              <span>{fmtRp(customer.membership.spent)}</span>
              <span>{fmtRp(customer.membership.target)}</span>
            </div>
            <Button size="sm" className="bg-background text-foreground hover:bg-background/90 mt-5 w-full" asChild>
              <Link to="/dashboard/membership">Lihat Benefit</Link>
            </Button>
          </div>
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
          <div className="space-y-2.5">
            {wishlist.slice(0, 3).map((w) => (
              <div key={w.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-secondary transition-colors">
                <div className="h-11 w-11 rounded-xl bg-secondary grid place-items-center text-2xl">{w.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{w.source}</p>
                </div>
                <p className="text-sm font-bold">{fmtRp(w.price)}</p>
              </div>
            ))}
          </div>
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
          <div className="space-y-2.5">
            {priceAlerts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-secondary transition-colors">
                <div className={`h-2 w-2 rounded-full shrink-0 ${a.status === "triggered" ? "bg-success animate-pulse" : "bg-warning"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{a.product}</p>
                  <p className="text-xs text-muted-foreground">Target {fmtRp(a.targetPrice)} · {a.lastChecked}</p>
                </div>
                <p className="text-sm font-bold">{fmtRp(a.currentPrice)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-3xl bg-secondary/40 border border-border/40 p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div>
          <h3 className="font-display font-bold text-lg">Bingung pilih barang?</h3>
          <p className="text-sm text-muted-foreground">Chat AI personal shopper kami — gratis, jawab dalam detik.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/dashboard/ai-shopper"><Sparkles className="h-4 w-4" />AI Shopper</Link></Button>
          <Button variant="hero" asChild><Link to="/whatsapp-demo"><MessageCircle className="h-4 w-4" />WhatsApp</Link></Button>
        </div>
      </div>
    </>
  );
};

export default Overview;
