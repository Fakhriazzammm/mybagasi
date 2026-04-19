import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Users, Crown, Calculator, Settings2, Truck, Store, Share2, Brain, Activity } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { platformStats, marketplaces } from "@/lib/superadmin-mock";

const Stat = ({ icon: Icon, label, value, sub }: any) => (
  <Card className="border-border/60">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="font-display text-2xl md:text-3xl font-bold mt-1">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="h-10 w-10 rounded-2xl bg-primary-soft text-primary grid place-items-center">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const sections = [
  { icon: Users, label: "Users", to: "/super-admin/users", desc: "Kelola semua role & status" },
  { icon: Crown, label: "Membership Plans", to: "/super-admin/plans", desc: "Free, Plus, Pro, Seller" },
  { icon: Calculator, label: "Pricing Rules", to: "/super-admin/pricing", desc: "Service fee & markup" },
  { icon: Settings2, label: "Fee Settings", to: "/super-admin/fees", desc: "Kurs, gateway, customs" },
  { icon: Truck, label: "Shipping Rules", to: "/super-admin/shipping", desc: "Rute & harga per kg" },
  { icon: Store, label: "Marketplaces", to: "/super-admin/marketplaces", desc: "Source & scraper health" },
  { icon: Share2, label: "Referral Commission", to: "/super-admin/commission", desc: "Tier & payout rules" },
  { icon: Brain, label: "AI Settings", to: "/super-admin/ai", desc: "Model, token, rate limit" },
];

export default function SuperAdminOverview() {
  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Platform Control Center"
        description="Konfigurasi dan kontrol penuh seluruh sistem MyBagasi."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        <Stat icon={Users} label="Total users" value={platformStats.totalUsers.toLocaleString("id-ID")} sub="semua role" />
        <Stat icon={Crown} label="Active members" value={platformStats.activeMembers.toLocaleString("id-ID")} sub="Plus / Pro / Seller" />
        <Stat icon={Share2} label="Affiliates" value={platformStats.affiliates} sub="creator aktif" />
        <Stat icon={Activity} label="AI tokens MTD" value={(platformStats.aiTokensMtd / 1000).toFixed(0) + "K"} sub="pemakaian bulan ini" />
      </div>

      <h2 className="font-display text-lg font-bold mb-3">Konfigurasi Sistem</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {sections.map((s) => (
          <Link key={s.to} to={s.to}>
            <Card className="border-border/60 hover:border-primary/40 hover:shadow-soft transition-all h-full">
              <CardContent className="p-5">
                <div className="h-10 w-10 rounded-2xl bg-primary-soft text-primary grid place-items-center mb-3">
                  <s.icon className="h-5 w-5" />
                </div>
                <p className="font-semibold">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Marketplace Health</CardTitle>
          <Button variant="ghost" size="sm" asChild><Link to="/super-admin/marketplaces">Manage</Link></Button>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {marketplaces.slice(0, 8).map((m) => (
            <div key={m.id} className="border border-border/60 rounded-2xl p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{m.name}</span>
                <Badge className={m.scraperHealth >= 95 ? "bg-success/15 text-success" : m.scraperHealth >= 90 ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"}>
                  {m.scraperHealth}%
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{m.ordersMtd} orders MTD</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
