import { useLandingCategories, useCategoryCounts } from "@/hooks/useLandingContent";

export const Categories = () => {
  const { data: categories = [], isLoading, error } = useLandingCategories();
  const { data: preorderCounts = [] } = useCategoryCounts();

  const totalPreordered = preorderCounts.reduce((s: number, p: any) => s + (p.quota_taken || 0), 0);
  const displayCategories = categories.map((c: any) => ({
    emoji: c.emoji,
    name: c.name,
    count: totalPreordered > 0 ? `${totalPreordered}+` : "—",
  }));

  return (
    <section className="container mx-auto py-20 md:py-28">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Kategori</span>
        <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4">
          Apa pun dari Jepang, kami carikan.
        </h2>
        {totalPreordered > 0 && (
          <p className="text-sm text-muted-foreground">{totalPreordered}+ produk sudah dipesan lewat MyBagasi</p>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-36 rounded-3xl bg-card border border-border/40 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="rounded-3xl bg-card border border-destructive/30 p-8 text-center text-destructive">
          Kategori gagal dimuat dari database.
        </div>
      ) : displayCategories.length === 0 ? (
        <div className="rounded-3xl bg-card border border-border/40 p-8 text-center text-muted-foreground">
          Belum ada kategori aktif di database.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {displayCategories.map((c) => (
            <button
              key={c.name}
              className="group rounded-3xl bg-card border border-border/40 p-6 text-left shadow-soft hover:shadow-card hover:-translate-y-1 transition-all"
            >
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">{c.emoji}</div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {c.count !== "—" ? `${c.count} produk dipesan` : "tersedia"}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};
