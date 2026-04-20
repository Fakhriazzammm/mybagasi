import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, ArrowRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuotations } from "@/hooks";
import { fmtRp } from "@/lib/customer-mock";
import type { QuotationStatus } from "@/types/database.types";

const tone: Record<QuotationStatus, string> = {
  active: "bg-success/15 text-success",
  expired: "bg-muted text-muted-foreground",
  converted: "bg-primary-soft text-primary",
};

const Quotations = () => {
  const [search, setSearch] = useState("");
  const { data: quotations = [], isLoading } = useQuotations();

  const filtered = quotations.filter(
    (q) =>
      q.product.toLowerCase().includes(search.toLowerCase()) ||
      q.source?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageHeader
        eyebrow="Quotations"
        title="Riwayat estimasi harga"
        description="Quote yang sudah kamu buat. Klik untuk lanjut beli atau pantau harganya."
        action={
          <Button variant="hero" asChild>
            <Link to="/quotation">
              <Plus className="h-4 w-4" />Buat Baru
            </Link>
          </Button>
        }
      />

      <div className="rounded-3xl bg-card border border-border/40 shadow-soft overflow-hidden">
        <div className="p-4 border-b border-border/60 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari quotation atau produk..."
              className="pl-9 rounded-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">Semua</Button>
            <Button variant="ghost" size="sm">Aktif</Button>
            <Button variant="ghost" size="sm">Expired</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-secondary/40">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">ID</th>
                  <th className="text-left px-5 py-3 font-medium">Produk</th>
                  <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Sumber</th>
                  <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Tanggal</th>
                  <th className="text-right px-5 py-3 font-medium">Total</th>
                  <th className="text-center px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                      {search ? "Tidak ada quotation yang cocok." : "Belum ada quotation."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((q) => (
                    <tr key={q.id} className="border-t border-border/40 hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{q.id.slice(0, 8)}…</td>
                      <td className="px-5 py-4 font-semibold">{q.product}</td>
                      <td className="px-5 py-4 hidden md:table-cell text-muted-foreground">{q.source ?? "—"}</td>
                      <td className="px-5 py-4 hidden md:table-cell text-muted-foreground">
                        {new Date(q.created_at).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-5 py-4 text-right font-bold">{fmtRp(q.total)}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${tone[q.status]}`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button variant="ghost" size="sm">
                          Detail <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
};

export default Quotations;
