import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { shopperService } from "@/services/shopper.service";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fmtRp } from "@/lib/format";
import {
  Wallet, TrendingUp, Receipt, FileText, ShoppingBag,
  ArrowUpRight, Download, Upload, Loader2,
} from "lucide-react";

const Stat = ({ icon: Icon, label, value, sub, tone = "primary" }: any) => (
  <Card className="border-border/60">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
          <p className="font-display text-2xl md:text-3xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={`h-10 w-10 rounded-2xl grid place-items-center shrink-0 ${
          tone === "primary" ? "bg-primary-soft text-primary" :
          tone === "success" ? "bg-success/15 text-success" :
          tone === "warn" ? "bg-warning/15 text-warning" :
          "bg-accent/15 text-accent"
        }`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  quote_created: "bg-primary-soft text-primary",
  waiting_payment: "bg-warning/15 text-warning",
  paid: "bg-success/15 text-success",
  procurement_queue: "bg-blue-500/15 text-blue-500",
  purchased: "bg-info/15 text-info",
  shipped_to_indonesia: "bg-primary-soft text-primary",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

export default function KeuanganPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState("ringkasan");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Ambil orders terbaru
        const { data, error } = await supabase
          .from('orders')
          .select('id, product, total, status, service_fee, shipping_cost, created_at')
          .order('created_at', { ascending: false })
          .limit(20);
        if (!error && data) setOrders(data);
      } catch (err) {
        console.error("Gagal muat data keuangan:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Hitung ringkasan
  const totalRevenue = orders
    .filter(o => ['paid', 'delivered', 'procurement_queue', 'purchased', 'shipped_to_indonesia'].includes(o.status))
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const totalFees = orders
    .filter(o => ['paid', 'delivered', 'procurement_queue', 'purchased', 'shipped_to_indonesia'].includes(o.status))
    .reduce((sum, o) => sum + (o.service_fee || 0), 0);

  const activeOrders = orders.filter(o => !['delivered', 'cancelled', 'refunded'].includes(o.status)).length;
  const completedOrders = orders.filter(o => ['delivered'].includes(o.status)).length;

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-20 bg-secondary rounded-3xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-28 bg-secondary rounded-2xl" />)}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Personal Shopper"
        title="Keuangan"
        description="Pantau pendapatan, transaksi, dan kelola resi belanja."
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Stat icon={Wallet} label="Total Pendapatan" value={fmtRp(totalRevenue)} />
        <Stat icon={TrendingUp} label="Total Fee Jasa" value={fmtRp(totalFees)} tone="success" />
        <Stat icon={ShoppingBag} label="Pesanan Aktif" value={activeOrders} tone="warn" />
        <Stat icon={FileText} label="Pesanan Selesai" value={completedOrders} tone="accent" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="ringkasan" className="text-xs">Ringkasan</TabsTrigger>
          <TabsTrigger value="resi" className="text-xs">Resi Belanja</TabsTrigger>
          <TabsTrigger value="laporan" className="text-xs">Laporan</TabsTrigger>
        </TabsList>

        {/* Ringkasan - Daftar Transaksi */}
        <TabsContent value="ringkasan" className="mt-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Transaksi Terbaru</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {orders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Belum ada transaksi</p>
                  <p className="text-xs mt-1">Transaksi akan muncul setelah ada order.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produk</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Fee</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium truncate max-w-[200px]">
                          {o.product || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColor[o.status] || "bg-muted text-muted-foreground"}>
                            {o.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtRp(o.service_fee || 0)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtRp(o.total || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Resi Belanja */}
        <TabsContent value="resi" className="mt-4">
          <Card className="border-border/60">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Resi Pembelian</CardTitle>
              <Button variant="hero" size="sm" disabled className="gap-1.5">
                <Upload className="h-4 w-4" />
                Upload Resi
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Fitur Resi Belanja</p>
                <p className="text-xs mt-1 max-w-md mx-auto">
                  Upload foto resi pembelian dari Jepang, sistem akan otomatis 
                  membaca item dan harga. Seperti YumiStruk.
                </p>
                <Button variant="outline" size="sm" className="mt-4" disabled>
                  <Download className="h-4 w-4 mr-1" />
                  Jalankan Migration DB
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Laporan */}
        <TabsContent value="laporan" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Ringkasan Bulanan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Grafik pendapatan</p>
                  <p className="text-xs mt-1">Tersedia setelah ada data transaksi yang cukup.</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Rekap Fee Jasa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Fee Jasa</span>
                    <span className="font-semibold">{fmtRp(totalFees)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Ongkir</span>
                    <span className="font-semibold">
                      {fmtRp(orders.reduce((s, o) => s + (o.shipping_cost || 0), 0))}
                    </span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-semibold">
                    <span>Grand Total</span>
                    <span>{fmtRp(totalRevenue)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
