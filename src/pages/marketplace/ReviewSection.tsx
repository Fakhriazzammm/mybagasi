import { useState, useEffect } from "react";
import { Star, ThumbsUp, Clock, User as UserIcon, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { personalShoppersService } from "@/services/personal-shoppers.service";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

// ─── Types ──────────────────────────────────────────────────────────────────

type ReviewWithProfile = {
  id: string;
  shopper_id: string;
  user_id: string;
  rating: number;
  review: string | null;
  created_at: string;
  profiles: { name: string; avatar_url: string | null } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
  return formatDate(dateStr);
}

// ─── Star Selector ───────────────────────────────────────────────────────────

function StarSelector({
  value,
  onChange,
  size = "md",
  disabled = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}) {
  const sizeClasses = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" };
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange?.(star)}
          className={`transition-all ${
            disabled ? "cursor-default" : "cursor-pointer hover:scale-110"
          } ${star <= value ? "text-amber-400" : "text-muted-foreground/30"}`}
        >
          <Star
            className={`${sizeClasses[size]} ${
              star <= value ? "fill-amber-400" : ""
            }`}
          />
        </button>
      ))}
    </div>
  );
}

// ─── Review Card ─────────────────────────────────────────────────────────────

function ReviewCard({
  review,
  isOwn,
  onEdit,
  onDelete,
}: {
  review: ReviewWithProfile;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-4 shadow-soft transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Avatar className="h-10 w-10 shrink-0 ring-2 ring-border/30">
            <AvatarImage
              src={review.profiles?.avatar_url ?? undefined}
              alt={review.profiles?.name ?? "User"}
            />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {getInitials(review.profiles?.name ?? "U")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">
                {review.profiles?.name ?? "Pengguna"}
              </span>
              {isOwn && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  Kamu
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <StarSelector value={review.rating} size="sm" disabled />
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo(review.created_at)}
              </span>
            </div>
          </div>
        </div>

        {isOwn && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={onEdit}
              title="Edit ulasan"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-red-500"
              onClick={onDelete}
              title="Hapus ulasan"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {review.review && (
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {review.review}
        </p>
      )}
    </div>
  );
}

// ─── Review Form ─────────────────────────────────────────────────────────────

function ReviewForm({
  initialRating = 0,
  initialReview = "",
  onSubmit,
  onCancel,
  loading,
  mode = "create",
}: {
  initialRating?: number;
  initialReview?: string;
  onSubmit: (rating: number, review: string) => Promise<void>;
  onCancel?: () => void;
  loading: boolean;
  mode: "create" | "edit";
}) {
  const [rating, setRating] = useState(initialRating);
  const [review, setReview] = useState(initialReview);
  const [hoveredStar, setHoveredStar] = useState(0);

  const canSubmit = rating > 0 && !loading;

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-soft space-y-4">
      <h4 className="font-semibold text-sm">
        {mode === "create" ? "Tulis Ulasan" : "Edit Ulasan"}
      </h4>

      {/* Star Rating */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Rating</p>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredStar(star)}
              onMouseLeave={() => setHoveredStar(0)}
              className="cursor-pointer hover:scale-110 transition-transform"
            >
              <Star
                className={`h-8 w-8 transition-colors ${
                  star <= (hoveredStar || rating)
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/30"
                }`}
              />
            </button>
          ))}
        </div>
        {rating > 0 && (
          <p className="text-xs text-muted-foreground">
            {rating === 1 && "Sangat Kurang"}
            {rating === 2 && "Kurang"}
            {rating === 3 && "Cukup"}
            {rating === 4 && "Baik"}
            {rating === 5 && "Sangat Baik"}
          </p>
        )}
      </div>

      {/* Review Text */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          Ulasan <span className="text-muted-foreground/50">(opsional)</span>
        </p>
        <Textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Bagikan pengalaman Anda dengan personal shopper ini..."
          className="min-h-[100px] resize-none text-sm"
          maxLength={1000}
        />
        <p className="text-[10px] text-muted-foreground text-right">
          {review.length}/1000
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          disabled={!canSubmit}
          onClick={() => onSubmit(rating, review)}
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {mode === "create" ? "Mengirim..." : "Menyimpan..."}
            </span>
          ) : mode === "create" ? (
            "Kirim Ulasan"
          ) : (
            "Simpan Perubahan"
          )}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Batal
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main ReviewSection ──────────────────────────────────────────────────────

interface ReviewSectionProps {
  shopperId: string;
}

export function ReviewSection({ shopperId }: ReviewSectionProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ReviewWithProfile[]>([]);
  const [userReview, setUserReview] = useState<ReviewWithProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingReview, setEditingReview] = useState<ReviewWithProfile | null>(null);

  // ─── Fetch reviews ────────────────────────────────────────────────────
  const fetchReviews = async () => {
    setLoading(true);
    try {
      const [allReviews, myReview] = await Promise.all([
        personalShoppersService.getReviews(shopperId),
        personalShoppersService.getUserReview(shopperId),
      ]);
      setReviews(allReviews as ReviewWithProfile[]);
      setUserReview(myReview as ReviewWithProfile | null);
    } catch (err: any) {
      toast.error("Gagal memuat ulasan", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [shopperId]);

  // ─── Submit review ────────────────────────────────────────────────────
  const handleSubmit = async (rating: number, review: string) => {
    if (!profile) {
      navigate("/auth/login");
      return;
    }
    setSubmitting(true);
    try {
      await personalShoppersService.createReview(shopperId, rating, review || undefined);
      toast.success("Ulasan berhasil dikirim!");
      setShowForm(false);
      await fetchReviews();
    } catch (err: any) {
      if (err.message?.includes("duplicate") || err.code === "23505") {
        toast.error("Anda sudah memberikan ulasan untuk personal shopper ini");
      } else {
        toast.error("Gagal mengirim ulasan", { description: err.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Edit review ──────────────────────────────────────────────────────
  const handleEdit = async (rating: number, review: string) => {
    if (!editingReview) return;
    setSubmitting(true);
    try {
      await personalShoppersService.updateReview(editingReview.id, rating, review || undefined);
      toast.success("Ulasan berhasil diperbarui!");
      setEditingReview(null);
      await fetchReviews();
    } catch (err: any) {
      toast.error("Gagal memperbarui ulasan", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Delete review ────────────────────────────────────────────────────
  const handleDelete = async (reviewId: string) => {
    if (!confirm("Hapus ulasan Anda? Tindakan ini tidak bisa dibatalkan.")) return;
    try {
      await personalShoppersService.deleteReview(reviewId);
      toast.success("Ulasan berhasil dihapus");
      await fetchReviews();
    } catch (err: any) {
      toast.error("Gagal menghapus ulasan", { description: err.message });
    }
  };

  // ─── Stats ────────────────────────────────────────────────────────────
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  const ratingDistribution = [0, 0, 0, 0, 0];
  reviews.forEach((r) => {
    if (r.rating >= 1 && r.rating <= 5) ratingDistribution[r.rating - 1]++;
  });

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border/40 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-4 w-full mt-3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Ulasan</h2>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-3.5 w-3.5 ${
                      star <= Math.round(avgRating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm font-medium">{avgRating.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">
                · {reviews.length} ulasan
              </span>
            </div>
          )}
        </div>

        {!userReview && !showForm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!profile) {
                navigate("/auth/login");
                return;
              }
              setShowForm(true);
            }}
          >
            <Star className="h-3.5 w-3.5 mr-1.5" />
            Beri Ulasan
          </Button>
        )}
      </div>

      {/* Rating Distribution */}
      {reviews.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card p-4 shadow-soft">
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingDistribution[star - 1];
              const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-right text-muted-foreground">{star}</span>
                  <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Review Form (create) */}
      {showForm && !userReview && (
        <ReviewForm
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
          loading={submitting}
          mode="create"
        />
      )}

      {/* Review Form (edit) */}
      {editingReview && (
        <ReviewForm
          initialRating={editingReview.rating}
          initialReview={editingReview.review ?? ""}
          onSubmit={handleEdit}
          onCancel={() => setEditingReview(null)}
          loading={submitting}
          mode="edit"
        />
      )}

      {/* Empty State */}
      {reviews.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Star className="h-10 w-10 text-muted-foreground/30" />
          <div className="space-y-1">
            <p className="font-medium text-sm">Belum ada ulasan</p>
            <p className="text-xs text-muted-foreground">
              Jadilah yang pertama memberikan ulasan untuk personal shopper ini.
            </p>
          </div>
        </div>
      )}

      {/* Review List */}
      {reviews.length > 0 && (
        <div className="space-y-3">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              isOwn={userReview?.id === review.id}
              onEdit={() => setEditingReview(review)}
              onDelete={() => handleDelete(review.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
