import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, AlertTriangle, RefreshCw } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { ProductCard } from "@/components/katalog/ProductCard";
import { CatalogSkeleton } from "@/components/katalog/CatalogSkeleton";
import { useCatalogCategory, type CatalogItem } from "@/hooks/useCatalog";
import { Button } from "@/components/ui/button";
import ProductDetailModal from "@/components/katalog/ProductDetailModal";

const LIMIT = 50;

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const [activeSub, setActiveSub] = useState<string | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<CatalogItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useCatalogCategory(
    category || "",
    activeSub,
    LIMIT,
    offset
  );

  // Reset pagination when sub-category changes
  const handleSubChange = (sub?: string) => {
    setActiveSub(sub);
    setOffset(0);
  };

  const displayedCount = data?.items?.length ?? 0;
  const totalCount = data?.total ?? 0;
  const hasMore = offset + LIMIT < totalCount;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Back link + header */}
          <div className="flex items-center gap-3 mb-6">
            <Link
              to="/katalog"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Kembali
            </Link>
            <h1 className="text-xl font-semibold capitalize">{category}</h1>
            {!isLoading && !isError && (
              <span className="text-xs bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full font-medium">
                {totalCount}
              </span>
            )}
          </div>

          {/* Sub-category filter chips */}
          {data?.sub_categories && data.sub_categories.length > 0 && (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.04 } },
              }}
              className="flex flex-wrap gap-2 mb-6"
            >
              <motion.button
                variants={{
                  hidden: { opacity: 0, scale: 0.9 },
                  visible: { opacity: 1, scale: 1 },
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSubChange(undefined)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeSub === undefined
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Semua
              </motion.button>
              {data.sub_categories.map((sub) => (
                <motion.button
                  key={sub}
                  variants={{
                    hidden: { opacity: 0, scale: 0.9 },
                    visible: { opacity: 1, scale: 1 },
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSubChange(sub)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeSub === sub
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {sub}
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Info bar */}
          {!isLoading && !isError && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-muted-foreground mb-4"
            >
              Menampilkan {displayedCount} dari {totalCount} produk
            </motion.p>
          )}

          {/* Loading state */}
          {isLoading && <CatalogSkeleton />}

          {/* Error state */}
          {isError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3"
            >
              <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
              <p className="text-sm text-muted-foreground">
                Gagal memuat produk: {(error as Error)?.message || "Terjadi kesalahan"}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Coba Lagi
              </Button>
            </motion.div>
          )}

          {/* Product grid */}
          <AnimatePresence mode="wait">
            {!isLoading && !isError && (
              <motion.div
                key={activeSub || "all"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {displayedCount === 0 ? (
                  <div className="text-center py-20">
                    <p className="text-muted-foreground">Belum ada produk di kategori ini</p>
                  </div>
                ) : (
                  <>
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      variants={{
                        hidden: {},
                        visible: { transition: { staggerChildren: 0.04 } },
                      }}
                      className="grid grid-cols-2 md:grid-cols-4 gap-3"
                    >
                      {data!.items.map((item) => (
                        <motion.div
                          key={item.id}
                          variants={{
                            hidden: { opacity: 0, y: 15 },
                            visible: { opacity: 1, y: 0 },
                          }}
                        >
                          <ProductCard item={item} onBeli={setSelectedProduct} />
                        </motion.div>
                      ))}
                    </motion.div>

                    {/* Load more pagination */}
                    {hasMore && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex justify-center mt-8"
                      >
                        <Button
                          variant="outline"
                          onClick={() => setOffset((prev) => prev + LIMIT)}
                        >
                          Load More
                        </Button>
                      </motion.div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {selectedProduct && (
          <ProductDetailModal
            item={selectedProduct}
            open={!!selectedProduct}
            onClose={() => setSelectedProduct(null)}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
