import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtRp, fmtJpy } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "@/hooks/useCatalog";

interface ProductCardProps {
  item: CatalogItem;
  onBeli?: (item: CatalogItem) => void;
  showPrice?: boolean;
}

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' fill='%23e2e8f0'%3E%3Crect width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2394a3b8' font-size='32'%3E📦%3C/text%3E%3C/svg%3E";

export function ProductCard({ item, showPrice = true, onBeli }: ProductCardProps) {
  const imgSrc = item.images?.[0] ? encodeURI(item.images[0]) : FALLBACK_IMG;

  const hasJpy = item.price_jpy != null && item.price_jpy > 0;
  const hasIdr = item.price_idr != null && item.price_idr > 0;

  const handleClick = () => {
    onBeli?.(item);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      whileHover={{ y: -6, transition: { type: "spring", stiffness: 400, damping: 17 } }}
      className="group flex flex-col rounded-xl border border-border/50 bg-card overflow-hidden transition-colors duration-150 hover:border-primary/30 hover:shadow-sm cursor-pointer"
    >
      {/* Image */}
      <div
        onClick={handleClick}
        className="aspect-square overflow-hidden bg-muted/30"
      >
        <motion.img
          src={imgSrc}
          alt={item.name}
          className="h-full w-full object-cover"
          loading="lazy"
          whileHover={{ scale: 1.1 }}
          transition={{ duration: 0.4 }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = FALLBACK_IMG;
          }}
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {/* Category tag */}
        {item.category && (
          <span className="text-[10px] text-muted-foreground truncate">
            {item.category}
            {item.sub_category ? ` · ${item.sub_category}` : ""}
          </span>
        )}

        {/* Name */}
        <div
          onClick={handleClick}
          className="text-sm font-medium leading-snug line-clamp-2 hover:text-primary transition-colors cursor-pointer"
        >
          {item.name}
        </div>

        {/* Price */}
        {showPrice && (
          <div className="mt-auto pt-1">
            {hasJpy || hasIdr ? (
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-baseline">
                {hasJpy && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    {fmtJpy(item.price_jpy!)}
                  </span>
                )}
                {hasIdr && (
                  <span className="text-sm font-bold text-primary">
                    {fmtRp(item.price_idr!)}
                  </span>
                )}
              </div>
            ) : (
              <Badge variant="outline" className="text-[10px] px-2 py-0">
                Hubungi
              </Badge>
            )}
          </div>
        )}

        {/* CTA */}
        <motion.div
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <Button
            variant="hero"
            size="sm"
            className="mt-2 w-full gap-1.5 text-xs"
            onClick={handleClick}
          >
            🛒 Beli via AI
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
