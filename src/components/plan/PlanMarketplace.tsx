import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Store, Star, ArrowRight, ShoppingBag, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { personalShoppersService } from "@/services/personal-shoppers.service";
import type { PersonalShopper } from "@/types/database.types";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getBadge(verification: string) {
  if (verification === "gold")
    return { label: "Verified Premium", bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-400", icon: "⭐" };
  if (verification === "blue")
    return { label: "Verified", bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400", icon: "✅" };
  return null;
}

export const PlanMarketplace = () => {
  const [shoppers, setShoppers] = useState<PersonalShopper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    personalShoppersService
      .list()
      .then((data) => setShoppers(data.slice(0, 3)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="container mx-auto py-20 md:py-28 px-4">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-xs uppercase tracking-widest text-accent font-semibold">
          Marketplace
        </span>
        <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4">
          Personal Shopper Terpercaya
        </h2>
        <p className="text-muted-foreground">
          Temukan dan pilih personal shopper favoritmu.{" "}
          <span className="text-foreground font-medium">Bandingkan layanan, harga, dan reputasi</span>{" "}
          mereka langsung dari satu halaman.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-3xl border border-border/40 bg-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-14 w-14 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
          {shoppers.map((shopper, i) => {
            const badge = getBadge(shopper.verification);
            return (
              <Link
                key={shopper.id}
                to={`/marketplace/${shopper.slug}`}
                className="group relative rounded-3xl bg-card p-6 shadow-card border border-border/40 hover:shadow-lg hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 block"
              >
                {/* Featured badge */}
                {shopper.featured && (
                  <div className="absolute -top-2.5 -right-2.5">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-coral text-primary-foreground text-[10px] font-bold shadow-soft whitespace-nowrap">
                      <Star className="h-3 w-3 fill-current" /> Featured
                    </span>
                  </div>
                )}

                {/* Avatar + Name */}
                <div className="flex items-start gap-3 mb-3">
                  <Avatar className="h-14 w-14 shrink-0 ring-2 ring-border/30">
                    <AvatarImage
                      src={shopper.avatar_url ?? undefined}
                      alt={shopper.name}
                    />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {getInitials(shopper.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 pt-1">
                    <h3 className="font-display font-bold text-base truncate group-hover:text-primary transition-colors">
                      {shopper.name}
                    </h3>
                    {badge && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text} font-medium leading-none mt-1`}
                      >
                        {badge.icon} {badge.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Tagline */}
                {shopper.tagline && (
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                    {shopper.tagline}
                  </p>
                )}

                {/* Services chips */}
                {shopper.services?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {shopper.services.slice(0, 3).map((svc) => (
                      <Badge
                        key={svc}
                        variant="secondary"
                        className="text-[10px] px-2 py-0.5 font-normal"
                      >
                        {svc}
                      </Badge>
                    ))}
                    {shopper.services.length > 3 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-2 py-0.5 font-normal"
                      >
                        +{shopper.services.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {shopper.stats.rating.toFixed(1)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {shopper.stats.orders_completed} pesanan
                  </span>
                  <span className="flex items-center gap-1 ml-auto group-hover:text-primary transition-colors text-[10px]">
                    Lihat Profil <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* CTA */}
      <div className="text-center mt-10">
        <Button variant="hero-secondary" size="lg" asChild>
          <Link to="/marketplace">
            <Store className="h-5 w-5" />
            Jelajahi Semua Personal Shopper
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
};
