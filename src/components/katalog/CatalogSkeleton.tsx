import { cn } from "@/lib/utils";

interface CatalogSkeletonProps {
  count?: number;
  className?: string;
}

export function CatalogSkeleton({ count = 8, className }: CatalogSkeletonProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 md:grid-cols-4 gap-3",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/50 bg-card overflow-hidden animate-pulse">
          {/* Image placeholder */}
          <div className="aspect-square bg-muted/50" />
          {/* Body */}
          <div className="p-3 space-y-2">
            <div className="h-2.5 w-16 rounded bg-muted/60" />
            <div className="h-3.5 w-full rounded bg-muted/60" />
            <div className="h-2 w-20 rounded bg-muted/60" />
            <div className="h-7 w-full rounded-lg bg-muted/60 mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
