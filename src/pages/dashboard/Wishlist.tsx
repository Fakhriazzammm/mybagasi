import { ShoppingBag, Bell, Trash2, Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { wishlist, fmtRp } from "@/lib/customer-mock";

const Wishlist = () => (
  <>
    <PageHeader
      eyebrow="Wishlist"
      title="Barang yang kamu incar"
      description="Simpan produk untuk dipantau atau dibeli nanti."
      action={<Button variant="hero"><Plus className="h-4 w-4" />Tambah Produk</Button>}
    />

    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {wishlist.map((w) => (
        <div key={w.id} className="rounded-3xl bg-card border border-border/40 p-5 shadow-soft hover:shadow-card transition-all group">
          <div className="aspect-square rounded-2xl bg-gradient-warm grid place-items-center text-7xl mb-4">
            {w.emoji}
          </div>
          <p className="font-semibold leading-tight line-clamp-2 min-h-[2.5rem]">{w.name}</p>
          <p className="text-xs text-muted-foreground mt-1">{w.source} · {w.note}</p>
          <p className="font-display text-xl font-bold text-primary mt-3">{fmtRp(w.price)}</p>
          <div className="flex gap-2 mt-4">
            <Button variant="hero" size="sm" className="flex-1"><ShoppingBag className="h-3.5 w-3.5" />Beli</Button>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"><Bell className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      ))}
    </div>
  </>
);

export default Wishlist;
