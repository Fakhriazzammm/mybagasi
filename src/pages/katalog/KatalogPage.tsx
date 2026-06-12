import { useState } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, ArrowRight, RefreshCw, MessageCircle } from "lucide-react";
import {
  useFeaturedProducts,
  useCatalogCategories,
  type CatalogCategory,
  type CatalogItem,
} from "@/hooks/useCatalog";
import { CategoryCard } from "@/components/katalog/CategoryCard";
import { ProductCard } from "@/components/katalog/ProductCard";
import { CatalogSkeleton } from "@/components/katalog/CatalogSkeleton";

// ─── Sub-components ──────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="text-center space-y-3 py-8 md:py-12">
      <h1 className="font-display text-2xl md:text-3xl font-bold">
        📦 Katalog Produk
      </h1>
      <p className="text-sm text-muted-foreground max-w-lg mx-auto">
        Jelajahi produk-produk pilihan dari Jepang. Dari fashion hingga
        elektronik — semuanya bisa dibeli via AI Personal Shopper.
      </p>
    </section>
  );
}

function SearchBar({
  value,
  onChange,
  onSearch,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
      className="flex gap-2 max-w-lg mx-auto"
    >
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cari produk di katalog..."
        className="flex-1"
      />
      <Button type="submit" variant="hero" size="sm" className="gap-1.5 shrink-0">
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Cari</span>
      </Button>
    </form>
  );
}

function CategoryGrid({
  categories,
}: {
  categories: CatalogCategory[];
}) {
  if (!categories.length) return null;

  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Kategori</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {categories.map((cat) => (
          <CategoryCard
            key={cat.name}
            name={cat.name}
            count={cat.count}
          />
        ))}
      </div>
    </section>
  );
}

function FeaturedSection({
  items,
}: {
  items: CatalogItem[];
}) {
  if (!items.length) return null;

  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg font-semibold">
        Produk Unggulan
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((item) => (
          <ProductCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="text-4xl">📭</span>
      <div className="space-y-1">
        <p className="font-medium">Belum ada produk di katalog</p>
        <p className="text-sm text-muted-foreground">
          Katalog akan segera hadir. Coba{" "}
          <Link
            to="/aipersonalshopper"
            className="text-primary underline underline-offset-2"
          >
            AI Personal Shopper
          </Link>{" "}
          untuk mencari produk dari Jepang.
        </p>
      </div>
    </div>
  );
}

function ErrorSection({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive" className="max-w-lg mx-auto">
      <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <span className="text-sm flex-1">
          Gagal memuat katalog: {message}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={onRetry}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Coba Lagi
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function CTASection() {
  return (
    <section className="text-center space-y-4 py-12 mt-8">
      <span className="text-3xl">🤖</span>
      <h2 className="font-display text-xl font-semibold">Butuh bantuan?</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Tidak menemukan yang kamu cari? Biarkan AI Personal Shopper kami
        mencarikannya langsung dari marketplace Jepang.
      </p>
      <Button variant="hero" size="lg" className="gap-2" asChild>
        <Link to="/aipersonalshopper">
          <MessageCircle className="h-4 w-4" />
          Tanya AI Personal Shopper
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const KatalogPage = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: featured,
    isLoading: featuredLoading,
    isError: featuredError,
    error: featuredErr,
    refetch: refetchFeatured,
  } = useFeaturedProducts();

  const {
    data: categories,
    isLoading: categoriesLoading,
    isError: categoriesError,
    error: categoriesErr,
    refetch: refetchCategories,
  } = useCatalogCategories();

  const handleSearch = () => {
    if (searchQuery.trim()) {
      window.location.href = `/aipersonalshopper?query=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  const isLoading = featuredLoading || categoriesLoading;
  const hasError = featuredError || categoriesError;
  const errorMessage =
    featuredErr instanceof Error
      ? featuredErr.message
      : categoriesErr instanceof Error
        ? categoriesErr.message
        : "Terjadi kesalahan";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-6 md:py-10 space-y-8">
        {/* Hero */}
        <HeroSection />

        {/* Search */}
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onSearch={handleSearch}
        />

        {/* Error */}
        {hasError && (
          <ErrorSection
            message={errorMessage}
            onRetry={() => {
              refetchFeatured();
              refetchCategories();
            }}
          />
        )}

        {/* Loading */}
        {isLoading && !hasError && <CatalogSkeleton count={8} />}

        {/* Content */}
        {!isLoading && !hasError && (
          <>
            {/* If we have no data at all */}
            {(!categories || categories.length === 0) &&
              (!featured || featured.length === 0) && <EmptyState />}

            {/* Categories */}
            {categories && categories.length > 0 && (
              <CategoryGrid categories={categories} />
            )}

            {/* Featured */}
            {featured && featured.length > 0 && (
              <FeaturedSection items={featured} />
            )}

            {/* CTA */}
            <CTASection />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default KatalogPage;
