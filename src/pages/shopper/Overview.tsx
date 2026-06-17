import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  ShoppingBag, Star, Calendar, MessageSquare, Package, User, TrendingUp,
  ExternalLink, Clock,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { shopperService, type ShopperDashboardStats } from "@/services/shopper.service";
import { fmtRp } from "@/lib/format";

const Stat = ({ icon: Icon, label, value, tone = "primary" }: any) => (
  <Card className="border-border/60">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="font-display text-2xl md:text-3xl font-bold mt-1">{value}</p>
        </div>
        <div className={`h-10 w-10 rounded-2xl grid place-items-center ${
          tone === "primary" ? "bg-primary-soft text-primary" :
          tone === "success" ? "bg-success/15 text-success" :
          "bg-warning/15 text-warning"
        }`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function ShopperOverview() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<ShopperDashboardStats | null>(null);
  const [shopperId, setShopperId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        // Ambil personal_shopper profile berdasarkan user_id
        const shopper = await shopperService.getMyProfile(profile.id);
        if (shopper) {
          setShopperId(shopper.id);
          const s = await shopperService.getMyStats(shopper.id);
          setStats(s);
        }
      } catch (err) {
        console.error("Gagal memuat data shopper:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [profile]);

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-20 bg-secondary rounded-3xl" />
      <div className="h-20 bg-secondary rounded-3xl" />
      <div className="h-20 bg-secondary rounded-3xl" />
    </div>
  );

  if (!shopperId) return (
    <div className="text-center py-12">
      <div className="h-16 w-16 rounded-full bg-muted grid place-items-center mx-auto mb-4">
        <User className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-lg font-semibold mb-1">Profil Personal Shopper belum terhubung</p>
      <p className="text-sm text-muted-foreground mb-4">
        Akun ini belum terhubung ke profil personal shopper di marketplace.
      </p>
      <Button asChild variant="hero">
        <Link to="/shopper/profil">Hubungkan Profil</Link>
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Personal Shopper"
        title="Dashboard Saya"
        description="Pantau order, jadwal, dan ulasan pelanggan."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Stat icon={ShoppingBag} label="Pesanan Selesai" value={stats?.ordersCompleted ?? 0} />
        <Stat icon={Star} label="Rating" value={stats?.totalRating?.toFixed(1) ?? "—"} tone="success" />
        <Stat icon={MessageSquare} label="Ulasan" value={stats?.reviewsCount ?? 0} />
        <Stat icon={Calendar} label="Jadwal Aktif" value={stats?.activeSchedules ?? 0} tone="warn" />
      </div>

      {/* Quick actions */}
      <Card className="border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-base">Aksi Cepat</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Package, label: "Pesanan Saya", to: "/shopper/pesanan" },
            { icon: Calendar, label: "Jadwal", to: "/shopper/jadwal" },
            { icon: Star, label: "Ulasan", to: "/shopper/ulasan" },
            { icon: User, label: "Profil", to: "/shopper/profil" },
          ].map((s) => (
            <Button key={s.to} variant="outline" asChild className="justify-start h-12 rounded-2xl">
              <Link to={s.to}><s.icon className="h-4 w-4 mr-2" />{s.label}</Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Marketplace link */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Marketplace</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Lihat profilmu di marketplace</p>
            <p className="text-xs text-muted-foreground">Calon pelanggan melihat profil ini saat mencari personal shopper.</p>
          </div>
          <Button variant="outline" asChild className="shrink-0">
            <Link to={`/marketplace`}><ExternalLink className="h-4 w-4 mr-1" />Buka Marketplace</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
