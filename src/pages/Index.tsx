import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { Categories } from "@/components/landing/Categories";
import { Testimonials } from "@/components/landing/Testimonials";
import { Membership } from "@/components/landing/Membership";
import { Affiliate } from "@/components/landing/Affiliate";
import { FAQ } from "@/components/landing/FAQ";
import { CTA } from "@/components/landing/CTA";
import { KatalogPreview } from "@/components/landing/KatalogPreview";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <KatalogPreview />
        <Categories />
        <Testimonials />
        <Membership />
        <Affiliate />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
