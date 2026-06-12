import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  MessageCircle,
  Home,
} from "lucide-react";
import { getInvoice, type MayarInvoiceStatus } from "@/lib/mayar";

const PaymentStatusPage = () => {
  const [params] = useSearchParams();
  const { getDashboardRoute } = useAuth();
  const invoiceId = params.get("invoice_id") ?? params.get("id") ?? "";
  const orderId = params.get("order_id");
  const statusUpdatedRef = useRef(false);

  if (!getDashboardRoute) {
    return null;
  }

  const [status, setStatus] = useState<MayarInvoiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!invoiceId) {
      setError("Invoice ID tidak ditemukan di URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getInvoice(invoiceId);
      setStatus(data);
      setError(null);
      if (data.status === "paid" && orderId && !statusUpdatedRef.current) {
        try {
          await supabase.from('orders')
            .update({ status: 'confirmed', paid_at: new Date().toISOString() })
            .eq('id', orderId);
          statusUpdatedRef.current = true;
        } catch (e) {
          console.error("Failed to update order status:", e);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengecek status pembayaran.");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  // Initial fetch + auto-poll every 5 s while unpaid
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status?.status === "paid") return;
    const timer = setInterval(fetchStatus, 5_000);
    return () => clearInterval(timer);
  }, [status?.status, fetchStatus]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-10 md:py-16 flex items-start justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-border/40 p-8 text-center shadow-soft">
          {/* Loading state */}
          {loading && !status && (
            <div className="space-y-4">
              <RefreshCw className="h-12 w-12 mx-auto text-muted-foreground animate-spin" />
              <p className="text-muted-foreground">Mengecek status pembayaran...</p>
            </div>
          )}

          {/* PAID */}
          {status?.status === "paid" && (
            <div className="space-y-5">
              <CheckCircle2 className="h-16 w-16 mx-auto text-success" />
              <div>
                <h1 className="font-display text-2xl font-bold mb-2">
                  Pembayaran Berhasil! 🎉
                </h1>
                <p className="text-muted-foreground text-sm">
                  Order kamu sudah dikonfirmasi. Tim MyBagasi akan segera memproses
                  pembelian dari Jepang dan menghubungi kamu via Telegram.
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 text-xs text-muted-foreground px-4 py-3 space-y-1 text-left">
                <p>
                  Invoice ID:{" "}
                  <span className="font-mono text-foreground">{status.id}</span>
                </p>
                <p>
                  Total:{" "}
                  <span className="font-semibold text-foreground">
                    Rp {status.amount.toLocaleString("id-ID")}
                  </span>
                </p>
                <p>
                  Nama: <span className="text-foreground">{status.customer.name}</span>
                </p>
                {status.payment_method && (
                  <p>Metode: <span className="text-foreground">{status.payment_method}</span></p>
                )}
                {status.paid_at && (
                  <p>Dibayar: <span className="text-foreground">{new Date(status.paid_at).toLocaleString("id-ID")}</span></p>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="hero" asChild className="flex-1">
                  <Link to={getDashboardRoute() + "/orders"}>
                    <Home className="h-4 w-4" />
                    Lihat Order
                  </Link>
                </Button>
                <Button variant="outline" asChild className="flex-1">
                  <Link to={getDashboardRoute() + "/ai-shopper"}>
                    <MessageCircle className="h-4 w-4" />
                    Telegram
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* PENDING / CREATED */}
          {status?.status === "created" && (
            <div className="space-y-5">
              <Clock className="h-16 w-16 mx-auto text-yellow-500" />
              <div>
                <h1 className="font-display text-2xl font-bold mb-2">
                  Menunggu Pembayaran
                </h1>
                <p className="text-muted-foreground text-sm">
                  Pembayaran belum dikonfirmasi. Halaman ini otomatis refresh setiap 5 detik.
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 text-xs text-muted-foreground px-4 py-3 space-y-1 text-left">
                <p>
                  Invoice ID:{" "}
                  <span className="font-mono text-foreground">{status.id}</span>
                </p>
                <p>
                  Total:{" "}
                  <span className="font-semibold text-foreground">
                    Rp {status.amount.toLocaleString("id-ID")}
                  </span>
                </p>
              </div>
              <Button variant="outline" onClick={fetchStatus} disabled={loading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Cek Ulang
              </Button>
            </div>
          )}

          {/* EXPIRED / CANCELLED */}
          {(status?.status === "expired" || status?.status === "cancelled") && (
            <div className="space-y-5">
              <XCircle className="h-16 w-16 mx-auto text-destructive" />
              <div>
                <h1 className="font-display text-2xl font-bold mb-2">
                  {status.status === "expired" ? "Invoice Kadaluarsa" : "Invoice Dibatalkan"}
                </h1>
                <p className="text-muted-foreground text-sm">
                  Invoice ini sudah tidak aktif. Silakan buat order baru.
                </p>
              </div>
              <Button variant="hero" asChild>
                <Link to={getDashboardRoute() + "/ai-shopper"}>Buat Order Baru</Link>
              </Button>
            </div>
          )}

          {/* Error (no invoice_id or fetch failed) */}
          {error && !status && (
            <div className="space-y-5">
              <XCircle className="h-16 w-16 mx-auto text-destructive" />
              <div>
                <h1 className="font-display text-2xl font-bold mb-2">
                  Terjadi Kesalahan
                </h1>
                <p className="text-muted-foreground text-sm">{error}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={fetchStatus} className="flex-1 gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Coba Lagi
                </Button>
                <Button variant="hero" asChild className="flex-1">
                  <Link to={getDashboardRoute() + "/ai-shopper"}>AI Shopper</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PaymentStatusPage;
