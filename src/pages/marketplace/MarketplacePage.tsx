import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, ShoppingBag, MapPin, ArrowRight } from "lucide-react";
import { personalShoppersService } from "@/services/personal-shoppers.service";
import type { PersonalShopper } from "@/types/database.types";
import { fmtJpy } from "@/lib/format";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatPrice(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}/kg`;
}

function formatRating(rating: number): string {
  return rating.toFixed(1);
}

function getVerificationLabel(verification: string): { label: string; bg: string; text: string } | null {
  if (verification === 'gold') return { label: '⭐ Verified Premium', bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-400' };
  if (verification === 'blue') return { label: '✅ Verified', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-400' };
  return null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="text-center space-y-4 py-8 md:py-12">
      <h1 className="font-display text-2xl md:text-3xl font-bold">
        Marketplace Personal Shopper
      </h1>
      <p className="text-sm text-muted-foreground max-w-xl mx-auto">
        Temukan personal shopper terpercaya untuk membantu belanja produk
        Jepang favoritmu. Bandingkan harga, layanan, dan reputasi mereka.
      </p>
    </section>
  );
}

function ShoppersGrid({
  shoppers,
  onSelect,
}: {
  shoppers: PersonalShopper[];
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
      {shoppers.map((shopper) => (
        <ShopperCard
          key={shopper.id}
          shopper={shopper}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ShopperCard({
  shopper,
  onSelect,
}: {
  shopper: PersonalShopper;
  onSelect: (slug: string) => void;
}) {
  const startingPrice = shopper.starting_price;

  return (
    <Card
      className="group cursor-pointer overflow-hidden border border-border/40 bg-card shadow-soft hover:shadow-md hover:border-primary/30 transition-all duration-300"
      onClick={() => onSelect(shopper.slug)}
    >
      <div className="p-5 space-y-4">
        {/* Avatar + Name + Badge */}
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0 ring-2 ring-border/50">
            <AvatarImage
              src={shopper.avatar_url ?? undefined}
              alt={shopper.name}
            />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
              {getInitials(shopper.name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">
                {shopper.name}
              </h3>
              {shopper.verification !== 'none' && (() => {
                const v = getVerificationLabel(shopper.verification);
                return v ? (
                  <span
                    className={`inline-flex items-center gap-1 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${v.bg} ${v.text} font-medium leading-none`}
                    title={v.label}
                  >
                    {v.label}
                  </span>
                ) : null;
              })()}
            </div>

            {shopper.tagline && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {shopper.tagline}
              </p>
            )}

            {shopper.location && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{shopper.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Services */}
        {shopper.services && shopper.services.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {shopper.services.slice(0, 4).map((service) => (
              <Badge
                key={service}
                variant="secondary"
                className="text-[10px] px-2 py-0.5 font-normal"
              >
                {service}
              </Badge>
            ))}
            {shopper.services.length > 4 && (
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0.5 font-normal"
              >
                +{shopper.services.length - 4}
              </Badge>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            {/* Rating */}
            <div className="flex items-center gap-1 text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-medium text-foreground">
                {formatRating(shopper.stats.rating)}
              </span>
              <span className="text-muted-foreground">
                ({shopper.stats.reviews_count})
              </span>
            </div>

            {/* Orders */}
            <div className="flex items-center gap-1 text-muted-foreground">
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>{shopper.stats.orders_completed} pesanan</span>
            </div>
          </div>

          {/* Starting Price */}
          {startingPrice !== null && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Mulai dari</p>
              <p className="font-semibold text-sm text-primary">
                {formatPrice(startingPrice)}
              </p>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-xs group-hover:bg-primary/5 group-hover:text-primary transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(shopper.slug);
            }}
          >
            Lihat Profil
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="overflow-hidden border border-border/40">
      <div className="p-5 space-y-4">
        {/* Avatar + Name */}
        <div className="flex items-start gap-3">
          <Skeleton className="h-12 w-12 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>

        {/* Services */}
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>

        {/* CTA */}
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="text-4xl">🛍️</span>
      <div className="space-y-1">
        <p className="font-medium">Belum ada personal shopper tersedia</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Personal shopper akan segera hadir. Pantau terus halaman ini untuk
          menemukan layanan terbaik dari Jepang.
        </p>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="text-4xl">😵</span>
      <div className="space-y-1">
        <p className="font-medium">Gagal memuat data</p>
        <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Coba Lagi
      </Button>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const MarketplacePage = () => {
  const navigate = useNavigate();
  const [shoppers, setShoppers] = useState<PersonalShopper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShoppers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await personalShoppersService.list();
      setShoppers(data ?? []);
    } catch (err: any) {
      const msg =
        err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShoppers();
  }, []);

  const handleSelect = (slug: string) => {
    navigate(`/marketplace/${slug}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-6 md:py-10 space-y-8">
        {/* Hero */}
        <HeroSection />

        {/* Loading */}
        {loading && <LoadingState />}

        {/* Error */}
        {!loading && error && <ErrorState message={error} onRetry={fetchShoppers} />}

        {/* Empty */}
        {!loading && !error && shoppers.length === 0 && <EmptyState />}

        {/* Grid */}
        {!loading && !error && shoppers.length > 0 && (
          <ShoppersGrid shoppers={shoppers} onSelect={handleSelect} />
        )}
      </main>

      <Footer />
    </div>
  );
};

export default MarketplacePage;
