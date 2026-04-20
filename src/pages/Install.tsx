import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Smartphone, Share, Plus, Download, Check, ArrowLeft, Apple, Chrome } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isStandalone } from "@/pwa";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("android");

  useEffect(() => {
    setInstalled(isStandalone());

    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setPlatform("ios");
    else if (/android/.test(ua)) setPlatform("android");
    else setPlatform("desktop");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      toast.success("MyBagasi terpasang", { description: "Buka dari home screen kamu." });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferred) {
      toast.info("Install belum tersedia", {
        description: "Ikuti panduan manual di bawah sesuai device kamu.",
      });
      return;
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      toast.success("Memasang MyBagasi…");
    }
    setDeferred(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-10 md:py-16 max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>

        <div className="text-center mb-10">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-coral text-primary-foreground shadow-glow mb-6">
            <Smartphone className="h-10 w-10" />
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-bold mb-3">
            Install MyBagasi <span className="text-primary">di HP kamu</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
            Akses lebih cepat seperti aplikasi native — tanpa perlu App Store atau Play Store.
          </p>
        </div>

        {installed ? (
          <Card className="p-8 text-center shadow-card border-success/30 bg-success/5 mb-8">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-success text-success-foreground mb-4">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="font-display text-2xl font-bold mb-2">Sudah terpasang</h2>
            <p className="text-muted-foreground">
              Kamu sedang membuka MyBagasi sebagai installed app. Tutup tab ini dan buka dari home screen.
            </p>
          </Card>
        ) : (
          <Card className="p-6 md:p-8 mb-8 shadow-card bg-gradient-warm border-primary/20">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <h2 className="font-display text-xl font-bold mb-1">Install instan</h2>
                <p className="text-sm text-muted-foreground">
                  {deferred
                    ? "Browser kamu mendukung install satu klik."
                    : "Kalau tombolnya tidak aktif, ikuti panduan manual di bawah."}
                </p>
              </div>
              <Button variant="hero" size="lg" onClick={handleInstall} disabled={!deferred}>
                <Download className="h-4 w-4" />
                Install MyBagasi
              </Button>
            </div>
          </Card>
        )}

        <Tabs value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="ios"><Apple className="h-4 w-4 mr-1.5" />iPhone</TabsTrigger>
            <TabsTrigger value="android"><Smartphone className="h-4 w-4 mr-1.5" />Android</TabsTrigger>
            <TabsTrigger value="desktop"><Chrome className="h-4 w-4 mr-1.5" />Desktop</TabsTrigger>
          </TabsList>

          <TabsContent value="ios" className="mt-6">
            <Card className="p-6 shadow-card">
              <h3 className="font-display text-lg font-bold mb-4">Cara install di iPhone / iPad</h3>
              <ol className="space-y-4">
                {[
                  { icon: Chrome, text: "Buka mybagasi.lovable.app di Safari (bukan Chrome — wajib Safari)." },
                  { icon: Share, text: "Ketuk tombol Share di bagian bawah layar (kotak dengan panah ke atas)." },
                  { icon: Plus, text: "Scroll ke bawah, pilih \"Add to Home Screen\" / \"Tambah ke Layar Utama\"." },
                  { icon: Check, text: "Ketuk \"Add\" di pojok kanan atas. Selesai — buka dari home screen." },
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex items-start gap-2 flex-1 pt-0.5">
                      <step.icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-sm">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </TabsContent>

          <TabsContent value="android" className="mt-6">
            <Card className="p-6 shadow-card">
              <h3 className="font-display text-lg font-bold mb-4">Cara install di Android</h3>
              <ol className="space-y-4">
                {[
                  "Buka mybagasi.lovable.app di Chrome.",
                  "Akan muncul banner \"Install MyBagasi\" — ketuk Install.",
                  "Atau ketuk menu titik tiga di pojok kanan atas, pilih \"Install app\" / \"Tambahkan ke layar utama\".",
                  "Konfirmasi Install. Icon MyBagasi akan muncul di home screen.",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-sm pt-1">{text}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </TabsContent>

          <TabsContent value="desktop" className="mt-6">
            <Card className="p-6 shadow-card">
              <h3 className="font-display text-lg font-bold mb-4">Cara install di Desktop (Chrome / Edge)</h3>
              <ol className="space-y-4">
                {[
                  "Buka mybagasi.lovable.app di Chrome atau Edge.",
                  "Cari ikon install (monitor dengan panah ke bawah) di address bar sebelah kanan.",
                  "Klik ikon tersebut, lalu klik Install.",
                  "MyBagasi akan terbuka sebagai aplikasi standalone dan muncul di Start Menu / Applications.",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-sm pt-1">{text}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          {[
            { title: "Lebih cepat", desc: "Buka langsung dari home screen tanpa browser bar." },
            { title: "Hemat data", desc: "Asset di-cache, loading lebih ringan." },
            { title: "Notifikasi", desc: "Update order & price alert mampir ke layar kamu." },
          ].map((f) => (
            <Card key={f.title} className="p-5">
              <h4 className="font-display font-bold mb-1">{f.title}</h4>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Install;
