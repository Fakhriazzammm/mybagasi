import { useState, useEffect } from "react";
import { Receipt, ExternalLink, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { fmtRp } from "@/lib/format";

interface Bill {
  id: string;
  mayar_invoice_id: string;
  invoice_url: string;
  status: "unpaid" | "paid" | "expired" | "cancelled" | "pending";
  total_idr: number;
  items_summary: { name: string; quantity: number; price: number }[];
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
}

const STATUS_META: Record<string, { emoji: string; label: string; tone: string }> = {
  unpaid: { emoji: "🟡", label: "Belum Bayar", tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  pending: { emoji: "⏳", label: "Menunggu", tone: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  paid: { emoji: "✅", label: "Lunas", tone: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  expired: { emoji: "❌", label: "Kedaluwarsa", tone: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  cancelled: { emoji: "🚫", label: "Dibatalkan", tone: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" },
};

const Bills = () => {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const fetchBills = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: err } = await supabase
          .from("bills")
          .select("id,mayar_invoice_id,invoice_url,status,total_idr,items_summary,created_at,paid_at,expires_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (err) throw err;
        setBills((data as Bill[]) || []);
      } catch (err: any) {
        console.error("Bills fetch error:", err);
        setError(err?.message || "Gagal memuat tagihan");
        setBills([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBills();
  }, [user?.id]);

  const statusCounts = {
    unpaid: bills.filter((b) => b.status === "unpaid" || b.status === "pending").length,
    total: bills.length,
  };

  return (
    <>
      <PageHeader
        eyebrow="Tagihan"
        title="Daftar tagihan"
        description={
          statusCounts.total > 0
            ? `${statusCounts.total} tagihan, ${statusCounts.unpaid} belum dibayar`
            : "Semua tagihan pembayaranmu di satu tempat."
        }
      />

      <div className="rounded-3xl bg-card border border-border/40 shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground/60" />
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-destructive font-medium">{error}</p>
            <p className="text-sm text-muted-foreground mt-1">Coba refresh halaman.</p>
          </div>
        ) : bills.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
            <p className="font-medium">Belum ada tagihan.</p>
            <p className="text-sm mt-1">Tagihan akan muncul setelah kamu checkout.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {bills.map((bill) => {
              const meta = STATUS_META[bill.status] || { emoji: "❓", label: bill.status, tone: "bg-muted text-muted-foreground" };
              const itemName =
                bill.items_summary?.[0]?.name?.slice(0, 40) || "";
              const createdDate = bill.created_at
                ? new Date(bill.created_at).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "";

              return (
                <div
                  key={bill.id}
                  className="flex items-start gap-4 p-5 hover:bg-secondary/30 transition-colors"
                >
                  <div className="h-14 w-14 rounded-2xl bg-secondary grid place-items-center text-primary shrink-0">
                    <Receipt className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${meta.tone}`}
                      >
                        {meta.emoji} {meta.label}
                      </span>
                      {bill.paid_at && (
                        <span className="text-[10px] text-muted-foreground">
                          Lunas {new Date(bill.paid_at).toLocaleDateString("id-ID")}
                        </span>
                      )}
                    </div>
                    {itemName && (
                      <p className="text-sm font-semibold mt-1 truncate">{itemName}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Dibuat {createdDate}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm">{fmtRp(bill.total_idr)}</p>
                    {bill.status === "unpaid" || bill.status === "pending" ? (
                      bill.invoice_url ? (
                        <Button
                          variant="hero"
                          size="sm"
                          className="mt-2"
                          asChild
                        >
                          <a
                            href={bill.invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Bayar <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </Button>
                      ) : (
                        <p className="text-[10px] text-muted-foreground mt-2">
                          Menunggu link pembayaran
                        </p>
                      )
                    ) : null}
                    {bill.expires_at && bill.status === "unpaid" && (
                      <p className="text-[10px] text-destructive mt-1">
                        Kedaluwarsa{" "}
                        {new Date(bill.expires_at).toLocaleDateString("id-ID")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default Bills;
