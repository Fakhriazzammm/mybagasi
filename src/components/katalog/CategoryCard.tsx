import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface CategoryCardProps {
  emoji?: string;
  name: string;
  count: number;
  to?: string;
}

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

export function CategoryCard({ name, count, to }: CategoryCardProps) {
  const emoji = EMOJI_MAP[name] ?? "📦";

  const content = (
    <>
      <span className="text-2xl leading-none">{emoji}</span>
      <span className="text-sm font-medium text-center leading-tight line-clamp-1">
        {name}
      </span>
      <span className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
        {count} item{count !== 1 ? "s" : ""}
      </span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          "flex flex-col items-center gap-1.5 rounded-xl border border-border/50",
          "bg-card p-3 transition-all duration-150",
          "hover:border-primary/40 hover:bg-primary-soft/30 hover:shadow-sm",
          "active:scale-[0.97] w-full"
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border border-border/50",
        "bg-card p-3 transition-all duration-150",
        "hover:border-primary/40 hover:bg-primary-soft/30 hover:shadow-sm",
        "active:scale-[0.97] w-full"
      )}
    >
      {content}
    </div>
  );
}
