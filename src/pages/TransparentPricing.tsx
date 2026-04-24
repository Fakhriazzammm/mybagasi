import { useMemo, useState } from "react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { appConfig } from "@/lib/runtime-config";

const fmtRp = (value: number) => "Rp " + Math.round(value).toLocaleString("id-ID");

const toNumber = (raw: string, fallback: number) => {
  const parsed = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default function TransparentPricing() {
  const [priceJpyInput, setPriceJpyInput] = useState("15000");
  const [rateInput, setRateInput] = useState(String(appConfig.pricing.jpyToIdr));

  const calc = useMemo(() => {
    const priceJpy = toNumber(priceJpyInput, 15000);
    const rate = toNumber(rateInput, appConfig.pricing.jpyToIdr);

    const baseProduct = priceJpy * rate;
    const baseFee = baseProduct * appConfig.pricing.serviceFeeRate;
    const baseShipping = appConfig.pricing.shippingIdr;
    const baseTax = (baseProduct + baseFee) * appConfig.pricing.taxRate;

    const baseTotal = baseProduct + baseFee + baseShipping + baseTax;

    const scenario = {
      best: {
        rate: rate * 0.98,
        shipping: baseShipping * 0.9,
        taxRate: Math.max(0.05, appConfig.pricing.taxRate - 0.015),
      },
      worst: {
        rate: rate * 1.04,
        shipping: baseShipping * 1.18,
        taxRate: appConfig.pricing.taxRate + 0.02,
      },
    };

    const calcTotal = (r: number, shipping: number, taxRate: number) => {
      const product = priceJpy * r;
      const fee = product * appConfig.pricing.serviceFeeRate;
      const tax = (product + fee) * taxRate;
      return { product, fee, shipping, tax, total: product + fee + shipping + tax };
    };

    return {
      priceJpy,
      rate,
      base: { product: baseProduct, fee: baseFee, shipping: baseShipping, tax: baseTax, total: baseTotal },
      best: calcTotal(scenario.best.rate, scenario.best.shipping, scenario.best.taxRate),
      worst: calcTotal(scenario.worst.rate, scenario.worst.shipping, scenario.worst.taxRate),
    };
  }, [priceJpyInput, rateInput]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-10 md:py-16">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8 text-center">
            <Badge className="bg-primary-soft text-primary">Customer Trust Layer</Badge>
            <h1 className="font-display text-3xl md:text-5xl font-bold mt-3">Biaya Transparan</h1>
            <p className="text-muted-foreground mt-2">Lihat komponen biaya secara terbuka: kurs, fee jasa, ongkir, dan pajak. Termasuk simulasi best-case dan worst-case.</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-5 mb-6">
            <Card className="border-border/60 lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Input simulasi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="price-jpy">Harga produk (JPY)</Label>
                  <Input id="price-jpy" value={priceJpyInput} onChange={(e) => setPriceJpyInput(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate">Kurs JPY ke IDR</Label>
                  <Input id="rate" value={rateInput} onChange={(e) => setRateInput(e.target.value)} />
                </div>
                <div className="text-xs text-muted-foreground rounded-xl bg-secondary/60 p-3">
                  Simulasi ini dipakai agar ekspektasi harga dari awal lebih jelas sebelum checkout.
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Breakdown biaya saat ini</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Harga produk ({calc.priceJpy.toLocaleString("ja-JP")} JPY)</span><span>{fmtRp(calc.base.product)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fee jasa ({Math.round(appConfig.pricing.serviceFeeRate * 100)}%)</span><span>{fmtRp(calc.base.fee)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ongkir Jepang ke Indonesia</span><span>{fmtRp(calc.base.shipping)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pajak dan bea ({Math.round(appConfig.pricing.taxRate * 100)}%)</span><span>{fmtRp(calc.base.tax)}</span></div>
                <div className="border-t border-border/60 pt-3 mt-2 flex justify-between font-bold text-base">
                  <span>Total all-in</span>
                  <span className="text-primary">{fmtRp(calc.base.total)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Best-case estimate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="text-muted-foreground">Kurs lebih baik, ongkir lebih rendah, dan pajak di range bawah.</p>
                <p className="font-display text-3xl font-bold text-success">{fmtRp(calc.best.total)}</p>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Worst-case estimate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="text-muted-foreground">Kurs naik, ongkir naik, dan pajak berada di range atas.</p>
                <p className="font-display text-3xl font-bold text-warning">{fmtRp(calc.worst.total)}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
