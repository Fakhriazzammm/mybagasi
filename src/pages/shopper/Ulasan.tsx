import { useEffect, useState } from "react";
import { Star, MessageSquare, User, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { shopperService } from "@/services/shopper.service";
import type { ShopperReviewWithProfile } from "@/services/shopper.service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(dateStr).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Review Card ─────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: ShopperReviewWithProfile }) {
  const displayName = review.profiles?.name ?? review.guest_name ?? "Pelanggan";
  const isGuest = !review.profiles && !!review.guest_name;

  return (
    <Card key={review.id} className="border-border/60">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0 ring-2 ring-border/30">
            <AvatarImage
              src={review.profiles?.avatar_url ?? undefined}
              alt={displayName}
            />
            <AvatarFallback
              className={`text-xs font-semibold ${
                isGuest
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">
                {displayName}
              </span>
              {isGuest && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-5 border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:bg-emerald-950/30"
                >
                  Guest
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <StarRating rating={review.rating} />
              <span className="text-[11px] text-muted-foreground">
                {timeAgo(review.created_at)}
              </span>
            </div>
            {review.review && (
              <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {review.review}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Shimmer Skeleton ────────────────────────────────────────────────────────

function ReviewSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="border-border/60">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-secondary shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-secondary rounded" />
                <div className="h-3 w-20 bg-secondary rounded" />
                <div className="h-3 w-full bg-secondary rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="h-16 w-16 rounded-full bg-muted grid place-items-center mx-auto mb-4">
        <MessageSquare className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-lg font-semibold mb-1">Belum ada ulasan</p>
      <p className="text-sm text-muted-foreground">
        Pelanggan belum memberikan ulasan untuk personal shopper ini.
      </p>
    </div>
  );
}

// ─── Error State ─────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="p-8 text-center">
        <div className="h-12 w-12 rounded-full bg-destructive/10 grid place-items-center mx-auto mb-3">
          <MessageSquare className="h-6 w-6 text-destructive" />
        </div>
        <p className="font-semibold mb-1">Gagal Memuat Ulasan</p>
        <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
          {message}
        </p>
        <Button variant="outline" onClick={onRetry}>
          Coba Lagi
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function UlasanPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ShopperReviewWithProfile[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Ambil shopper ID via slug
        const shopper = await shopperService.getShopperBySlug("mybagasi-jastip");
        if (!shopper) {
          setError("Profil Personal Shopper tidak ditemukan.");
          setLoading(false);
          return;
        }

        const result = await shopperService.getReviews(shopper.id, page, 10);
        setReviews(result.data);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } catch (err: any) {
        console.error("Gagal memuat ulasan:", err);
        setError(err?.message ?? "Terjadi kesalahan saat memuat data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [page]);

  return (
    <>
      <PageHeader
        eyebrow="Personal Shopper"
        title="Ulasan Pelanggan"
        description={
          total > 0
            ? `${total} ulasan dari pelanggan`
            : "Lihat ulasan yang diberikan oleh pelanggan"
        }
      />

      {/* Loading */}
      {loading && <ReviewSkeleton />}

      {/* Error */}
      {!loading && error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setPage(1);
          }}
        />
      )}

      {/* Empty */}
      {!loading && !error && reviews.length === 0 && <EmptyState />}

      {/* Reviews List */}
      {!loading && !error && reviews.length > 0 && (
        <>
          <div className="space-y-3 mb-6">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    // Show current, first, last, and neighbors
                    return (
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - page) <= 1
                    );
                  })
                  .map((p, idx, arr) => (
                    <span key={p} className="flex items-center">
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-muted-foreground text-xs">
                          ...
                        </span>
                      )}
                      <Button
                        variant={p === page ? "default" : "ghost"}
                        size="sm"
                        className="min-w-9 h-9 p-0"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    </span>
                  ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
