import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { shopperService } from "@/services/shopper.service";
import {
  Save, Globe, MapPin, Hash, Plus, X, AtSign,
} from "lucide-react";
import { toast } from "sonner";
import type { PersonalShopper } from "@/types/database.types";

export default function ProfileShopperPage() {
  const [shopper, setShopper] = useState<PersonalShopper | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [newService, setNewService] = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const data = await shopperService.getShopperBySlug("mybagasi-jastip");
        if (data) {
          setShopper(data);
          setName(data.name);
          setTagline(data.tagline ?? "");
          setDescription(data.description ?? "");
          setLocation(data.location ?? "");
          setWebsite(data.website ?? "");
          setServices(data.services ?? []);
          setSocialLinks(data.social_links ?? {});
        }
      } catch (err) {
        setError("Gagal memuat data profil.");
        console.error("Gagal memuat profil shopper:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addService = () => {
    const trimmed = newService.trim();
    if (trimmed && !services.includes(trimmed)) {
      setServices([...services, trimmed]);
      setNewService("");
    }
  };

  const removeService = (svc: string) => {
    setServices(services.filter((s) => s !== svc));
  };

  const updateSocialLink = (platform: string, value: string) => {
    setSocialLinks((prev) => ({ ...prev, [platform]: value }));
  };

  const handleSave = async () => {
    if (!shopper) return;
    setSaving(true);
    try {
      await shopperService.updateProfile(shopper.id, {
        name,
        tagline: tagline || null,
        description: description || null,
        location: location || null,
        website: website || null,
        services,
        social_links: socialLinks,
      });
      toast.success("Profil berhasil disimpan");
    } catch (err) {
      console.error("Gagal menyimpan profil:", err);
      toast.error("Gagal menyimpan profil");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-20 bg-secondary rounded-3xl" />
        <div className="h-20 bg-secondary rounded-3xl" />
        <div className="h-20 bg-secondary rounded-3xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="h-16 w-16 rounded-full bg-destructive/10 grid place-items-center mx-auto mb-4">
          <span className="text-destructive text-2xl font-bold">!</span>
        </div>
        <p className="text-lg font-semibold text-destructive mb-1">Gagal Memuat Data</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            setError(null);
            setShopper(null);
            // Retry
            shopperService
              .getShopperBySlug("mybagasi-jastip")
              .then((data) => {
                if (data) {
                  setShopper(data);
                  setName(data.name);
                  setTagline(data.tagline ?? "");
                  setDescription(data.description ?? "");
                  setLocation(data.location ?? "");
                  setWebsite(data.website ?? "");
                  setServices(data.services ?? []);
                  setSocialLinks(data.social_links ?? {});
                }
                setLoading(false);
              })
              .catch((err) => {
                setError("Gagal memuat data profil.");
                setLoading(false);
              });
          }}
        >
          Coba Lagi
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Personal Shopper"
        title="Profil Marketplace"
        description="Kelola profil personal shopper MyBagasi & Jastip."
      />

      <div className="space-y-6">
        {/* Basic Info */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Informasi Dasar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nama</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama personal shopper"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Tagline singkat"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Deskripsi</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Deskripsikan layanan personal shopper Anda"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Location & Website */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Lokasi &amp; Website</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="location">
                <MapPin className="h-3.5 w-3.5 inline mr-1" />
                Lokasi
              </Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Kota, Negara"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">
                <Globe className="h-3.5 w-3.5 inline mr-1" />
                Website
              </Label>
              <Input
                id="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          </CardContent>
        </Card>

        {/* Services / Tags */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Layanan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {services.length === 0 && (
                <p className="text-sm text-muted-foreground">Belum ada layanan ditambahkan.</p>
              )}
              {services.map((svc) => (
                <Badge key={svc} variant="secondary" className="gap-1 px-3 py-1.5">
                  <Hash className="h-3 w-3" />
                  {svc}
                  <button
                    type="button"
                    onClick={() => removeService(svc)}
                    className="ml-1 hover:text-destructive transition-colors"
                    aria-label={`Hapus ${svc}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newService}
                onChange={(e) => setNewService(e.target.value)}
                placeholder="Tambah layanan"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addService();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addService}
                disabled={!newService.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Tambah
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Social Links */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Media Sosial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {["instagram", "twitter", "tiktok"].map((platform) => (
              <div key={platform} className="space-y-2">
                <Label htmlFor={`social-${platform}`} className="capitalize">
                  <AtSign className="h-3.5 w-3.5 inline mr-1" />
                  {platform}
                </Label>
                <Input
                  id={`social-${platform}`}
                  value={socialLinks[platform] ?? ""}
                  onChange={(e) => updateSocialLink(platform, e.target.value)}
                  placeholder={`Username ${platform}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
    </>
  );
}
