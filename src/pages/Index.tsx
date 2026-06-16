import { Footer } from "@/components/site/Footer";
import { PlanHero } from "@/components/plan/PlanHero";
import { PlanHowItWorks } from "@/components/plan/PlanHowItWorks";
import { PlanMarketplace } from "@/components/plan/PlanMarketplace";
import { PlanWhyUs } from "@/components/plan/PlanWhyUs";
import { PlanCTA } from "@/components/plan/PlanCTA";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <main className="pb-20 md:pb-0">
        <PlanHero />
        <PlanHowItWorks />
        <PlanMarketplace />
        <PlanWhyUs />
        <PlanCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
