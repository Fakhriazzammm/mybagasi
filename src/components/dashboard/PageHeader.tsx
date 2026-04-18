import { ReactNode } from "react";

export const PageHeader = ({ eyebrow, title, description, action }: {
  eyebrow?: string; title: string; description?: string; action?: ReactNode;
}) => (
  <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
    <div>
      {eyebrow && <span className="text-[11px] uppercase tracking-widest text-primary font-semibold">{eyebrow}</span>}
      <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">{title}</h1>
      {description && <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">{description}</p>}
    </div>
    {action && <div className="flex gap-2">{action}</div>}
  </div>
);
