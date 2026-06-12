import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useFeaturedProducts, useCatalogCategories, type CatalogCategory } from "@/hooks/useCatalog";

const EMOJI_MAP: Record<string, string> = {
  Fashion: "👕",
  Makeup: "💄",
  Sepatu: "👟",
  Gacha: "🎮",
  Snack: "🍜",
  Toys: "🧸",
  "Disney Store": "🏰",
  "Donqi Items": "🛍️",
};

const FALLBACK_EMOJI = "📦";

function getEmoji(name: string): string {
  return EMOJI_MAP[name] ?? FALLBACK_EMOJI;
}

function CategoryCard({ name, count }: { name: string; count: number }) {
  return (
    <Link
      to={`/katalog/${encodeURIComponent(name)}`}
      className="group rounded-xl border border-border/40 bg-card p-4 text-left shadow-soft hover:shadow-card hover:-translate-y-0.5 transition-all flex flex-col items-start gap-1"
    >
      <span className="text-2xl">{getEmoji(name)}</span>
      <p className="font-semibold text-sm">{name}</p>
      <p className="text-xs text-muted-foreground">{count} produk</p>
    </Link>
  );
}

function FeaturedProduct({
  item,
}: {
  item: { id: string; name: string; images: string[]; price_jpy?: number | null; price_idr?: number | null };
}) {
  const imgSrc = item.images?.[0]
    ? item.images[0].startsWith("/") || item.images[0].startsWith("http")
      ? item.images[0]
      : "/" + item.images[0]
    : null;

  const priceDisplay = item.price_jpy
    ? `JPY ${item.price_jpy.toLocaleString("id-ID")}`
    : item.price_idr
      ? `Rp ${item.price_idr.toLocaleString("id-ID")}`
      : null;

  return (
    <Link
      to={`/aipersonalshopper?catalog_id=${item.id}`}
      className="group rounded-xl border border-border/40 bg-card overflow-hidden hover:shadow-card hover:-translate-y-0.5 transition-all"
    >
      <div className="aspect-square bg-muted/30 overflow-hidden">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-3xl text-muted-foreground/40">📷</div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className="text-xs font-medium line-clamp-2 leading-snug">{item.name}</p>
        {priceDisplay && <p className="text-xs font-semibold text-primary">{priceDisplay}</p>}
        {!priceDisplay && (
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Hubungi</span>
        )}
      </div>
    </Link>
  );
}

function PreviewSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/40 bg-card overflow-hidden animate-pulse">
          <div className="aspect-square bg-muted" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export const KatalogPreview = () => {
  const { data: categories = [], isLoading: catLoading } = useCatalogCategories();
  const { data: featured = [], isLoading: featLoading } = useFeaturedProducts();

  const isLoading = catLoading || featLoading;
  const hasAnyData = categories.length > 0 || featured.length > 0;

  if (!isLoading && !hasAnyData) return null;

  return (
    <section className="container mx-auto py-16 md:py-20">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Katalog</span>
        <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-3">
          💎 Jelajahi Katalog Produk
        </h2>
        <p className="text-sm text-muted-foreground">
          Koleksi produk Jepang pilihan — langsung pesan via AI Personal Shopper.
        </p>
      </div>

      {isLoading ? (
        <PreviewSkeleton />
      ) : (
        <>
          {/* Category Grid */}
          {categories.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {categories.slice(0, 8).map((cat) => (
                <CategoryCard key={cat.name} name={cat.name} count={cat.count} />
              ))}
            </div>
          )}

          {/* CTA ke Katalog */}
          <div className="text-center mb-10">
            <Button variant="hero" size="lg" className="gap-2" asChild>
              <Link to="/katalog">
                📍 Lihat Semua Katalog
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Featured Products */}
          {featured.length > 0 && (
            <>
              <h3 className="font-display text-lg font-semibold mb-4">Produk Unggulan</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {featured.slice(0, 4).map((item) => (
                  <FeaturedProduct key={item.id} item={item} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
};
