import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        whileHover={{ scale: 1.05, y: -4 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        <Link
          to={to}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-xl border border-border/50",
            "bg-card p-3 transition-colors duration-150",
            "hover:border-primary/40 hover:bg-primary-soft/30 hover:shadow-sm",
            "w-full"
          )}
        >
          {content}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ scale: 1.05, y: -4 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border border-border/50",
        "bg-card p-3 transition-colors duration-150",
        "hover:border-primary/40 hover:bg-primary-soft/30 hover:shadow-sm",
        "w-full"
      )}
    >
      {content}
    </motion.div>
  );
}
