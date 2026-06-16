import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star,
  MapPin,
  Globe,
  Instagram,
  MessageCircle,
  Phone,
  ArrowLeft,
  ShoppingBag,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { personalShoppersService } from "@/services/personal-shoppers.service";
import type { PersonalShopper } from "@/types/database.types";
import { ReviewSection } from "./ReviewSection";

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8 space-y-8">
        {/* Back button skeleton */}
        <Skeleton className="h-10 w-44 rounded-full" />

        {/* Cover skeleton */}
        <Skeleton className="w-full h-52 md:h-72 rounded-3xl" />

        {/* Profile header */}
        <div className="flex flex-col md:flex-row items-start gap-6 -mt-16 relative z-10">
          <Skeleton className="w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-background shrink-0" />
          <div className="flex-1 space-y-3 pt-4 md:pt-8">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-5 w-80" />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>

        {/* Description */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>

        {/* Services */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-36" />
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-28 rounded-full" />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ─── Error State ──────────────────────────────────────────────────────────────

function NotFoundState() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md space-y-6">
          <div className="mx-auto h-20 w-20 rounded-full bg-muted grid place-items-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Personal Shopper Tidak Ditemukan</h1>
          <p className="text-muted-foreground text-sm">
            Personal shopper yang Anda cari tidak tersedia atau belum terdaftar.
            Silakan kembali ke marketplace untuk melihat daftar personal shopper lainnya.
          </p>
          <Button variant="default" asChild>
            <Link to="/marketplace">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Kembali ke Marketplace
            </Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ─── Rating Stars ─────────────────────────────────────────────────────────────

function RatingStars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.5;
  const stars = [];

  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars.push(<Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />);
    } else if (i === full && hasHalf) {
      stars.push(
        <span key={i} className="relative">
          <Star className="h-4 w-4 text-muted-foreground" />
          <Star
            className="h-4 w-4 fill-amber-400 text-amber-400 absolute inset-0"
            style={{ clipPath: "inset(0 50% 0 0)" }}
          />
        </span>
      );
    } else {
      stars.push(<Star key={i} className="h-4 w-4 text-muted-foreground" />);
    }
  }

  return <div className="flex items-center gap-0.5">{stars}</div>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShopperDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [shopper, setShopper] = useState<PersonalShopper | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError("Slug not provided");
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);

    personalShoppersService
      .getBySlug(slug)
      .then((data) => {
        if (!cancelled) {
          setShopper(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "Gagal memuat data personal shopper");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading) return <DetailSkeleton />;

  // ─── Error / Not found ────────────────────────────────────────────────
  if (error || !shopper) return <NotFoundState />;

  const {
    name,
    avatar_url,
    cover_url,
    tagline,
    description,
    verification,
    services,
    stats,
    pricing_description,
    starting_price,
    location,
    website,
    social_links,
  } = shopper;

  // ─── Social links ─────────────────────────────────────────────────────
  const socialLinks = [
    { icon: Instagram, href: social_links?.instagram, label: "Instagram", color: "hover:bg-pink-500 hover:text-white" },
    { icon: MessageCircle, href: social_links?.telegram, label: "Telegram", color: "hover:bg-blue-500 hover:text-white" },
    { icon: Phone, href: social_links?.whatsapp, label: "WhatsApp", color: "hover:bg-green-500 hover:text-white" },
  ].filter((s) => s.href);

  const coverGradient = cover_url
    ? undefined
    : `linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)`;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-6">
          {/* ── Back button ─────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Button variant="ghost" size="sm" asChild className="mb-4">
              <Link to="/marketplace">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Kembali ke Marketplace
              </Link>
            </Button>
          </motion.div>

          {/* ── Cover ───────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative w-full h-52 md:h-72 rounded-3xl overflow-hidden"
          >
            {cover_url ? (
              <img
                src={cover_url}
                alt={`${name} cover`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
            <div
              className="absolute inset-0"
              style={
                cover_url
                  ? { background: "linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.5))" }
                  : { background: coverGradient }
              }
            />
          </motion.div>

          {/* ── Profile Header ──────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="flex flex-col md:flex-row items-start gap-6 -mt-16 relative z-10 mb-8"
          >
            {/* Avatar */}
            <div className="shrink-0">
              {avatar_url ? (
                <img
                  src={avatar_url}
                  alt={name}
                  className="w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-background object-cover bg-muted shadow-lg"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    (e.currentTarget.nextSibling as HTMLElement)?.classList.remove("hidden");
                  }}
                />
              ) : null}
              <div
                className={`w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-background bg-gradient-to-br from-primary to-primary/70 grid place-items-center shadow-lg ${
                  avatar_url ? "hidden" : ""
                }`}
              >
                <ShoppingBag className="h-12 w-12 text-primary-foreground" />
              </div>
            </div>

            {/* Name & Tagline */}
            <div className="flex-1 pt-4 md:pt-12 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold">{name}</h1>
                {verification !== 'none' && (
                  <ShieldCheck className={`h-6 w-6 shrink-0 ${verification === 'gold' ? 'text-amber-500' : 'text-blue-500'}`} />
                )}
              </div>
              {tagline && (
                <p className="text-muted-foreground text-sm md:text-base max-w-xl">
                  {tagline}
                </p>
              )}
            </div>

            {/* CTA Button (desktop) */}
            <div className="hidden md:flex pt-12 shrink-0">
              <Button size="lg" className="gap-2" asChild>
                <a
                  href={website || social_links?.instagram || social_links?.telegram || social_links?.whatsapp || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-5 w-5" />
                  Hubungi Personal Shopper
                </a>
              </Button>
            </div>
          </motion.div>

          {/* ── Mobile CTA ──────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="md:hidden mb-6"
          >
            <Button size="lg" className="w-full gap-2" asChild>
              <a
                href={website || instagram || telegram || whatsapp || "#"}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-5 w-5" />
                Hubungi Personal Shopper
              </a>
            </Button>
          </motion.div>

          {/* ── Content Grid ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Stats Cards */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="grid grid-cols-3 gap-4"
              >
                <div className="rounded-2xl border border-border/50 bg-card p-5 text-center space-y-1 shadow-soft">
                  <ShoppingBag className="h-6 w-6 mx-auto text-primary" />
                  <p className="text-2xl font-bold">{stats.orders_completed.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Pesanan Selesai</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-card p-5 text-center space-y-1 shadow-soft">
                  <div className="flex justify-center">
                    <RatingStars rating={stats.rating} />
                  </div>
                  <p className="text-2xl font-bold">{stats.rating.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Rating</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-card p-5 text-center space-y-1 shadow-soft">
                  <Star className="h-6 w-6 mx-auto text-amber-400" />
                  <p className="text-2xl font-bold">{stats.reviews_count.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Ulasan</p>
                </div>
              </motion.div>

              {/* Description */}
              {description && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.25 }}
                >
                  <h2 className="text-lg font-semibold mb-3">Tentang Saya</h2>
                  <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {description}
                  </div>
                </motion.section>
              )}

              {/* Services */}
              {services.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                >
                  <h2 className="text-lg font-semibold mb-3">Layanan</h2>
                  <div className="flex flex-wrap gap-2">
                    {services.map((service) => (
                      <Badge
                        key={service}
                        variant="secondary"
                        className="px-3 py-1.5 text-sm font-normal"
                      >
                        {service}
                      </Badge>
                    ))}
                  </div>
                </motion.section>
              )}

              {/* ── Reviews ─────────────────────────────────────────── */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35 }}
              >
                <ReviewSection shopperId={shopper.id} />
              </motion.div>
            </div>

            {/* Right Column: Sidebar */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="space-y-6"
            >
              {/* Pricing */}
              {pricing_description && (
                <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-soft">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-primary" />
                    Informasi Harga
                  </h3>
                  {starting_price && (
                    <p className="text-2xl font-bold text-primary mb-2">
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(starting_price)}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {pricing_description}
                  </p>
                </div>
              )}

              {/* Location */}
              {location && (
                <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-soft">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Lokasi
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {location}
                  </p>
                </div>
              )}

              {/* Social Links */}
              {socialLinks.length > 0 && (
                <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-soft">
                  <h3 className="font-semibold text-sm mb-3">Social Media</h3>
                  <div className="flex flex-wrap gap-2">
                    {socialLinks.map(({ icon: Icon, href, label, color }) => (
                      <a
                        key={label}
                        href={href!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-full bg-secondary text-sm font-medium transition-colors ${color}`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Website */}
              {website && (
                <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-soft">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    Website
                  </h3>
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    <ChevronRight className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* CTA Button (sidebar) */}
              <Button size="lg" className="w-full gap-2" asChild>
                <a
                  href={website || social_links?.instagram || social_links?.telegram || social_links?.whatsapp || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-5 w-5" />
                  Hubungi Personal Shopper
                </a>
              </Button>

              <Button variant="outline" size="lg" className="w-full gap-2" asChild>
                <Link to="/marketplace">
                  <ArrowLeft className="h-4 w-4" />
                  Kembali ke Marketplace
                </Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
