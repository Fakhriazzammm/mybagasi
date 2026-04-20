import { MapPin, Plus, Pencil, Trash2, Star, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { useAddresses, useDeleteAddress, useSetPrimaryAddress } from "@/hooks";

const Addresses = () => {
  const { data: addresses = [], isLoading } = useAddresses();
  const deleteMutation = useDeleteAddress();
  const setPrimaryMutation = useSetPrimaryAddress();

  return (
    <>
      <PageHeader
        eyebrow="Alamat"
        title="Alamat pengiriman"
        description="Atur alamat tujuan pengiriman barang dari Jepang."
        action={<Button variant="hero"><Plus className="h-4 w-4" />Tambah Alamat</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : addresses.length === 0 ? (
        <div className="rounded-3xl bg-card border border-border/40 p-12 text-center text-muted-foreground">
          Belum ada alamat. Tambahkan alamat pengiriman pertamamu.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {addresses.map((a) => (
            <div
              key={a.id}
              className={`rounded-3xl p-6 shadow-soft border ${a.is_primary ? "bg-card border-primary/40" : "bg-card border-border/40"}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-primary-soft text-primary grid place-items-center">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display font-bold">{a.label}</p>
                    {a.is_primary && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold mt-0.5">
                        <Star className="h-2.5 w-2.5" /> Utama
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(a.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="font-semibold">{a.recipient}</p>
              <p className="text-sm text-muted-foreground">{a.phone}</p>
              <p className="text-sm mt-3">{a.line}</p>
              <p className="text-sm text-muted-foreground">{a.city} · {a.postal}</p>
              {!a.is_primary && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setPrimaryMutation.mutate(a.id)}
                  disabled={setPrimaryMutation.isPending}
                >
                  <Star className="h-3.5 w-3.5" />Jadikan Utama
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default Addresses;
