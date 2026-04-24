import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import {
  Send,
  CheckCheck,
  Package,
  CreditCard,
  Plane,
  Home,
  Sparkles,
  Image as ImageIcon,
  ExternalLink,
} from "lucide-react";
import {
  analyzeProductScreenshot,
  estimateAllInFromJPY,
  sendMessage,
  type ChatMessage,
} from "@/lib/ai";
import type { ProductData } from "@/lib/scraper";

const API_KEY =
  (import.meta.env.VITE_SUMOPOD_API_KEY as string | undefined) ??
  (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ??
  "";

type DetailEntry = { k: string; v: string };

type AlternativeRow = {
  headers: string[];
  cells: string[];
};

type AlternativesData = {
  rows: AlternativeRow[];
  outro: string;
};

type Msg = {
  id: number;
  from: "user" | "bot";
  text?: string;
  card?:
    | "quotation"
    | "payment"
    | "tracking"
    | "product"
    | "comparison"
    | "product-detail"
    | "alternatives";
  product?: ProductData;
  comparisons?: ComparisonItem[];
  details?: DetailEntry[];
  alternatives?: AlternativesData;
  time: string;
};

type FunnelState = "discovering" | "comparing" | "confirming" | "payment" | "post-payment";

type ComparisonItem = {
  title: string;
  marketplace: string;
  condition: string;
  price_jpy: number;
  price_display: string;
  total_estimated_idr: number;
};

const initialMsgs: Msg[] = [
  {
    id: 1,
    from: "bot",
    text: "Konnichiwa! Saya MyBagasi AI. Mau cari barang apa dari Jepang hari ini?",
    time: "10:00",
  },
];

const URL_REGEX = /https?:\/\//i;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createSearchAcknowledgement = () => {
  const variants = [
    "Siap, aku cek link produk kamu dulu ya. Biasanya butuh sekitar 10-20 detik.",
    "Noted! Aku lagi membuka link dan mengambil detail produknya dulu ya. Tunggu sebentar.",
    "Oke, aku proses link-nya dulu sekarang. Estimasi sekitar belasan detik.",
  ];

  const followUps = [
    "Sambil nunggu, kamu maunya kondisi baru saja atau second juga boleh?",
    "Biar aku carikan opsi terbaik, kamu prefer size/warna tertentu?",
    "Kalau stok di link habis, aku lanjut cari alternatif termurah juga ya?",
  ];

  return `${variants[Math.floor(Math.random() * variants.length)]}\n${followUps[Math.floor(Math.random() * followUps.length)]}`;
};

const quickReplies = [
  "Belikan sepatu Onitsuka Tiger",
  "https://mercari.com/items/m12345",
  "Cari skincare Hada Labo",
  "Pre-order Pokemon card",
];

function parsePipeTable(text: string): {
  before: string;
  headers: string[];
  rows: string[][];
  after: string;
} | null {
  const lines = text.split("\n");
  const tableStart = lines.findIndex((line) => line.trim().startsWith("|"));
  if (tableStart < 0 || tableStart + 2 >= lines.length) return null;

  // Collect contiguous pipe-prefixed lines from tableStart
  let end = tableStart;
  while (end < lines.length && lines[end].trim().startsWith("|")) end += 1;
  const candidate = lines.slice(tableStart, end);
  if (candidate.length < 3) return null;

  const splitRow = (line: string) => {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((cell) => cell.trim());
  };

  const headers = splitRow(candidate[0]).filter(Boolean);
  const rows = candidate
    .slice(2)
    .map(splitRow)
    .filter((row) => row.some((cell) => cell.length > 0))
    .map((row) => {
      // pad/truncate to headers length
      const out = row.slice(0, headers.length);
      while (out.length < headers.length) out.push("");
      return out;
    });
  if (!headers.length || !rows.length) return null;

  const before = lines.slice(0, tableStart).join("\n").trim();
  const after = lines.slice(end).join("\n").trim();
  return { before, headers, rows, after };
}

const MD_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function renderInline(text: string): ReactNode {
  if (!text) return null;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // Helper to render bold segments inside a plain-text span
  const pushPlain = (segment: string) => {
    if (!segment) return;
    const parts = segment.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        nodes.push(
          <strong key={`b-${key++}`} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      } else if (part) {
        nodes.push(<Fragment key={`t-${key++}`}>{part}</Fragment>);
      }
    }
  };

  const regex = new RegExp(MD_LINK.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    pushPlain(text.slice(lastIndex, match.index));
    nodes.push(
      <a
        key={`l-${key++}`}
        href={match[2]}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80 break-all"
      >
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  pushPlain(text.slice(lastIndex));
  return nodes;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "kv-list"; items: DetailEntry[] }
  | { type: "bullets"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "paragraph"; text: string };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].replace(/:$/, "").trim(),
      });
      i += 1;
      continue;
    }

    // Table: consecutive lines starting with '|'
    if (trimmed.startsWith("|")) {
      const chunk: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        chunk.push(lines[i]);
        i += 1;
      }
      const parsed = parsePipeTable(chunk.join("\n"));
      if (parsed) {
        blocks.push({ type: "table", headers: parsed.headers, rows: parsed.rows });
        continue;
      }
      // fallback: treat as paragraph
      blocks.push({ type: "paragraph", text: chunk.join("\n") });
      continue;
    }

    // Bullet list: consecutive '-' or '*' lines
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      // If every item is "**key:** value", render as KV list
      const kvItems = items
        .map((item) => {
          const m = item.match(/^\*\*([^*]+?):\*\*\s*(.*)$/);
          return m ? { k: m[1].trim(), v: m[2].trim() } : null;
        })
        .filter((x): x is DetailEntry => Boolean(x));
      if (kvItems.length === items.length && kvItems.length > 0) {
        blocks.push({ type: "kv-list", items: kvItems });
      } else {
        blocks.push({ type: "bullets", items });
      }
      continue;
    }

    // Paragraph: collect until blank line / heading / bullet / table
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("|") &&
      !/^[-*]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    if (paraLines.length) {
      blocks.push({ type: "paragraph", text: paraLines.join(" ") });
    }
  }
  return blocks;
}

const DetailTable = ({ items }: { items: DetailEntry[] }) => (
  <div className="overflow-hidden rounded-lg border border-border/60">
    <table className="w-full text-xs">
      <tbody>
        {items.map((it, idx) => (
          <tr key={idx} className="border-b border-border/40 last:border-b-0 odd:bg-muted/30">
            <td className="px-2 py-1.5 font-medium text-muted-foreground align-top w-[38%] whitespace-nowrap">
              {it.k}
            </td>
            <td className="px-2 py-1.5 align-top break-words">{renderInline(it.v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const AlternativesList = ({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) => {
  const findIdx = (names: string[]) =>
    headers.findIndex((h) => names.some((n) => h.toLowerCase().includes(n)));
  const titleIdx = findIdx(["produk", "title", "nama", "marketplace"]);
  const priceIdx = findIdx(["harga", "price"]);
  const condIdx = findIdx(["kondisi", "condition"]);
  const totalIdx = findIdx(["total", "estimasi"]);
  const linkIdx = findIdx(["link", "url", "buka"]);

  const extractLink = (cell: string): { label: string; href: string | null } => {
    const m = cell.match(MD_LINK);
    if (m && m[0]) {
      const single = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(m[0]);
      if (single) return { label: single[1], href: single[2] };
    }
    if (/^https?:\/\//i.test(cell.trim())) {
      return { label: cell.trim().replace(/^https?:\/\//i, ""), href: cell.trim() };
    }
    return { label: cell, href: null };
  };

  return (
    <div className="space-y-2">
      {rows.map((row, idx) => {
        const title =
          titleIdx >= 0 ? row[titleIdx] : row[0] ?? "Opsi";
        const price = priceIdx >= 0 ? row[priceIdx] : "";
        const cond = condIdx >= 0 ? row[condIdx] : "";
        const total = totalIdx >= 0 ? row[totalIdx] : "";
        const linkCell = linkIdx >= 0 ? row[linkIdx] : "";
        const link = linkCell ? extractLink(linkCell) : { label: "", href: null };
        const titleParsed = extractLink(title);

        return (
          <div
            key={idx}
            className="rounded-lg border border-border/60 bg-muted/20 p-2 text-xs space-y-1"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium leading-tight line-clamp-2 flex-1">
                {titleParsed.href ? (
                  <a
                    href={titleParsed.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground hover:text-primary"
                  >
                    {titleParsed.label}
                  </a>
                ) : (
                  titleParsed.label
                )}
              </p>
              {price && (
                <span className="shrink-0 text-[11px] font-semibold text-primary">
                  {price}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {cond && (
                <span>
                  Kondisi: <span className="text-foreground">{cond}</span>
                </span>
              )}
              {total && (
                <span>
                  Total: <span className="text-foreground font-medium">{total}</span>
                </span>
              )}
            </div>
            {link.href && (
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Buka produk
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Heading = ({ level, text }: { level: number; text: string }) => {
  const cls =
    level <= 2
      ? "text-sm font-semibold"
      : level === 3
        ? "text-[13px] font-semibold"
        : "text-xs font-semibold text-muted-foreground uppercase tracking-wide";
  return <p className={cls}>{text}</p>;
};

const MessageText = ({ text }: { text: string }) => {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }
  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        if (block.type === "heading") {
          return <Heading key={idx} level={block.level} text={block.text} />;
        }
        if (block.type === "paragraph") {
          return (
            <p key={idx} className="whitespace-pre-wrap leading-snug">
              {renderInline(block.text)}
            </p>
          );
        }
        if (block.type === "bullets") {
          return (
            <ul key={idx} className="list-disc pl-4 space-y-0.5 leading-snug">
              {block.items.map((item, i) => (
                <li key={i}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "kv-list") {
          return <DetailTable key={idx} items={block.items} />;
        }
        if (block.type === "table") {
          return <AlternativesList key={idx} headers={block.headers} rows={block.rows} />;
        }
        return null;
      })}
    </div>
  );
};

// ---- AI reply section splitter ----

const DETAIL_HEADER = /(?:^|\n)#{2,4}\s*(?:produk\s+yang\s+ditemukan|product\s+detail|detail\s+produk)[^\n]*/i;
const ESTIMATE_HEADER = /(?:^|\n)#{2,4}\s*(?:estimasi\s+total\s+biaya|estimasi\s+biaya|total\s+biaya)[^\n]*/i;
const ALTERNATIVES_HEADER = /(?:^|\n)#{2,4}\s*(?:opsi\s+pembanding|alternatif(?:\s+lebih\s+murah)?|pembanding)[^\n]*/i;

function splitAIResponse(text: string): {
  intro: string;
  detail: string;
  alternatives: string;
} {
  if (!text) return { intro: "", detail: "", alternatives: "" };

  const altMatch = ALTERNATIVES_HEADER.exec(text);
  const detailMatch = DETAIL_HEADER.exec(text);
  const estimateMatch = ESTIMATE_HEADER.exec(text);

  let intro = "";
  let detail = "";
  let alternatives = "";

  const detailStart =
    detailMatch?.index ?? estimateMatch?.index ?? -1;
  const altStart = altMatch?.index ?? -1;

  if (detailStart >= 0 && altStart >= 0) {
    intro = text.slice(0, detailStart).trim();
    detail = text.slice(detailStart, altStart).trim();
    alternatives = text.slice(altStart).trim();
  } else if (detailStart >= 0) {
    intro = text.slice(0, detailStart).trim();
    detail = text.slice(detailStart).trim();
  } else if (altStart >= 0) {
    intro = text.slice(0, altStart).trim();
    alternatives = text.slice(altStart).trim();
  } else {
    intro = text.trim();
  }

  return { intro, detail, alternatives };
}

function extractDetailEntries(detailText: string): DetailEntry[] {
  const items: DetailEntry[] = [];
  const lines = detailText.split("\n");
  for (const line of lines) {
    const m = line.trim().match(/^[-*]\s*\*\*([^*]+?):\*\*\s*(.*)$/);
    if (m) {
      items.push({ k: m[1].trim(), v: m[2].trim() });
    }
  }
  return items;
}

function extractAlternatives(altText: string): AlternativesData | null {
  const parsed = parsePipeTable(altText);
  if (!parsed) return null;
  const rows: AlternativeRow[] = parsed.rows.map((cells) => ({
    headers: parsed.headers,
    cells,
  }));
  return { rows, outro: parsed.after };
}

const QuotationCard = () => (
  <div className="rounded-2xl bg-background border border-border p-4 mt-2 shadow-soft">
    <div className="flex items-center gap-2 mb-3">
      <div className="h-9 w-9 rounded-xl bg-primary-soft grid place-items-center text-primary">
        <Sparkles className="h-4 w-4" />
      </div>
      <div>
        <p className="font-semibold text-sm">Quotation #Q-1287</p>
        <p className="text-[11px] text-muted-foreground">Onitsuka Tiger Mexico 66</p>
      </div>
    </div>
    <div className="space-y-1.5 text-xs border-t border-border/60 pt-3">
      {[
        ["Harga produk", "JPY 9.800 (Rp 1.029.000)"],
        ["Fee jasa MyBagasi", "Rp 154.000"],
        ["Ongkir Jepang ke Indo", "Rp 285.000"],
        ["Pajak & bea", "Rp 124.000"],
        ["Diskon Plus", "-Rp 45.000"],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between text-muted-foreground">
          <span>{k}</span>
          <span className="text-foreground">{v}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-border/60 pt-2 mt-2 font-bold">
        <span>Total all-in</span>
        <span className="text-primary">Rp 1.547.000</span>
      </div>
    </div>
    <div className="flex gap-2 mt-3">
      <Button size="sm" variant="hero" className="flex-1">
        Lanjut Beli
      </Button>
      <Button size="sm" variant="outline">
        Simpan
      </Button>
    </div>
  </div>
);

const PaymentCard = () => (
  <div className="rounded-2xl bg-background border border-border p-4 mt-2 shadow-soft">
    <div className="flex items-center gap-2 mb-3">
      <div className="h-9 w-9 rounded-xl bg-success/15 grid place-items-center text-success">
        <CreditCard className="h-4 w-4" />
      </div>
      <div>
        <p className="font-semibold text-sm">Pembayaran berhasil</p>
        <p className="text-[11px] text-muted-foreground">VA BCA - Rp 1.547.000</p>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">Order #ORD-8821 masuk antrian procurement.</p>
  </div>
);

const TrackingCard = () => {
  const steps = [
    { icon: CreditCard, label: "Dibayar", done: true },
    { icon: Package, label: "Dibeli di Jepang", done: true },
    { icon: Plane, label: "Dalam pengiriman", done: true, current: true },
    { icon: Home, label: "Sampai rumah", done: false },
  ];

  return (
    <div className="rounded-2xl bg-background border border-border p-4 mt-2 shadow-soft">
      <p className="font-semibold text-sm mb-3">Tracking #ORD-8821</p>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-3 items-center">
            <div
              className={`h-8 w-8 rounded-full grid place-items-center ${
                s.current
                  ? "bg-primary text-primary-foreground animate-pulse-soft"
                  : s.done
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <s.icon className="h-4 w-4" />
            </div>
            <span className={`text-xs ${s.done ? "font-semibold" : "text-muted-foreground"}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProductCard = ({
  product,
  detailsAvailable,
  alternativesAvailable,
  onViewDetail,
  onAskCheaper,
  onBuyNow,
}: {
  product: ProductData;
  detailsAvailable: boolean;
  alternativesAvailable: boolean;
  onViewDetail: () => void;
  onAskCheaper: () => void;
  onBuyNow: () => void;
}) => (
  <div className="rounded-2xl bg-background border border-border p-3 mt-2 shadow-soft space-y-2">
    {product.images?.[0] && (
      <img
        src={product.images[0]}
        alt={product.title}
        className="w-full h-40 object-cover rounded-xl border border-border/60"
      />
    )}
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{product.marketplace}</p>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          estimasi
        </span>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full ${
            product.available ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
          }`}
        >
          {product.available ? "stok tersedia" : "sold out"}
        </span>
      </div>
      <p className="font-semibold text-sm line-clamp-2">{product.title || "Produk ditemukan"}</p>
      <p className="text-sm mt-1">
        Harga: <span className="font-bold text-primary">{product.price_display || "Tidak ditemukan"}</span>
      </p>
      {product.condition && <p className="text-xs text-muted-foreground">Kondisi: {product.condition}</p>}
      {product.price_jpy && (
        <div className="text-xs mt-2 space-y-1 border-t border-border/60 pt-2">
          {(() => {
            const fees = estimateAllInFromJPY(product.price_jpy);
            return (
              <>
                <div className="flex justify-between">
                  <span>Harga (Rp)</span>
                  <span>Rp {fees.basePrice.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Fee jasa</span>
                  <span>Rp {fees.serviceFee.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ongkir</span>
                  <span>Rp {fees.shipping.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pajak</span>
                  <span>Rp {fees.tax.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between font-bold text-primary">
                  <span>Total estimasi</span>
                  <span>Rp {fees.total.toLocaleString("id-ID")}</span>
                </div>
              </>
            );
          })()}
        </div>
      )}
      {product.scraped_at && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Last checked: {new Date(product.scraped_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
    <div className="space-y-2 pt-1">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onViewDetail}
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-2 text-xs font-medium hover:bg-muted transition-colors"
          title={detailsAvailable ? "Tampilkan detail produk" : "Detail belum tersedia"}
        >
          Lihat detail lengkap
        </button>
        <button
          type="button"
          onClick={onAskCheaper}
          className="inline-flex items-center justify-center rounded-lg border border-border px-2 py-2 text-xs font-medium hover:bg-muted transition-colors"
          title={
            alternativesAvailable
              ? "Tampilkan opsi pembanding"
              : "Carikan alternatif lebih murah"
          }
        >
          Minta alternatif lebih murah
        </button>
      </div>
      <button
        type="button"
        onClick={onBuyNow}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-2 py-2 text-xs font-semibold hover:opacity-90 transition-opacity"
        title="Bayar sekarang via Mayar"
      >
        <CreditCard className="h-3.5 w-3.5" />
        Bayar sekarang via Mayar
      </button>
    </div>
  </div>
);

const ProductDetailBubble = ({ items }: { items: DetailEntry[] }) => (
  <div className="space-y-2 mt-1">
    <p className="text-sm font-semibold">Detail produk</p>
    <DetailTable items={items} />
  </div>
);

const AlternativesBubble = ({ data }: { data: AlternativesData }) => {
  const headers = data.rows[0]?.headers ?? [];
  const rows = data.rows.map((r) => r.cells);
  return (
    <div className="space-y-2 mt-1">
      <p className="text-sm font-semibold">Opsi pembanding lebih murah</p>
      {rows.length > 0 ? (
        <AlternativesList headers={headers} rows={rows} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Belum ada opsi pembanding yang bisa ditampilkan.
        </p>
      )}
      {data.outro && (
        <p className="text-[11px] text-muted-foreground leading-snug whitespace-pre-wrap">
          {renderInline(data.outro)}
        </p>
      )}
    </div>
  );
};

const ComparisonCard = ({
  comparisons,
  onPick,
  onBuyPick,
  onCompareAgain,
}: {
  comparisons: ComparisonItem[];
  onPick: (item: ComparisonItem) => void;
  onBuyPick: (item: ComparisonItem) => void;
  onCompareAgain: () => void;
}) => (
  <div className="rounded-2xl bg-background border border-border p-3 mt-2 shadow-soft">
    <p className="text-sm font-semibold mb-2">Perbandingan 3 opsi termurah</p>
    <div className="space-y-2">
      {comparisons.map((item, idx) => (
        <div key={`${item.marketplace}-${idx}`} className="rounded-lg border border-border p-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Marketplace</span>
            <span className="font-medium">{item.marketplace}</span>
            <span className="text-muted-foreground">Harga</span>
            <span className="font-medium">{item.price_display}</span>
            <span className="text-muted-foreground">Kondisi</span>
            <span className="font-medium">{item.condition}</span>
            <span className="text-muted-foreground">Estimasi total</span>
            <span className="font-semibold text-primary">Rp {item.total_estimated_idr.toLocaleString("id-ID")}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onPick(item)}
              className="rounded-md border border-border py-1 font-medium hover:bg-muted"
            >
              Pilih ini
            </button>
            <button
              type="button"
              onClick={() => onBuyPick(item)}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-primary text-primary-foreground py-1 font-semibold hover:opacity-90 transition-opacity"
              title="Bayar opsi ini via Mayar"
            >
              <CreditCard className="h-3 w-3" />
              Bayar
            </button>
          </div>
        </div>
      ))}
    </div>
    <button
      type="button"
      onClick={onCompareAgain}
      className="mt-2 w-full rounded-md border border-border py-1 text-xs font-medium hover:bg-muted"
    >
      Bandingkan lagi
    </button>
  </div>
);

const WhatsAppDemo = () => {
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>(initialMsgs);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [funnelState, setFunnelState] = useState<FunnelState>("discovering");
  const scrollRef = useRef<HTMLDivElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const hasApiKey = Boolean(API_KEY?.trim());

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  const now = () => new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  const send = async (text: string) => {
    if (!text.trim() || typing) return;
    if (!hasApiKey) {
      setMsgs((m) => [
        ...m,
        {
          id: Date.now(),
          from: "bot",
          text: "Konfigurasi AI belum lengkap. Isi VITE_SUMOPOD_API_KEY atau VITE_OPENAI_API_KEY di file .env lalu restart aplikasi.",
          time: now(),
        },
      ]);
      return;
    }

    const trimmedText = text.trim();
    if (/checkout|bayar|invoice|pembayaran/i.test(trimmedText)) {
      setFunnelState("payment");
    } else if (/tracking|dikirim|sampai/i.test(trimmedText)) {
      setFunnelState("post-payment");
    }

    const userMsg: Msg = { id: Date.now(), from: "user", text: trimmedText, time: now() };
    setMsgs((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);

    const updatedHistory: ChatMessage[] = [...history, { role: "user", content: trimmedText }];
    setHistory(updatedHistory);

    try {
      if (URL_REGEX.test(trimmedText)) {
        setFunnelState("discovering");
        const steps = [
          "Normalisasi link...",
          "Mengambil detail produk...",
          "Menyusun estimasi biaya...",
        ];

        for (const [idx, step] of steps.entries()) {
          setMsgs((m) => [
            ...m,
            {
              id: Date.now() + idx + 1,
              from: "bot",
              text: idx === 0 ? `${createSearchAcknowledgement()}\n${step}` : step,
              time: now(),
            },
          ]);
          await wait(600);
        }
      }

      const { text: reply, scrapedProduct } = await sendMessage(updatedHistory, API_KEY);
      const safeReply = reply?.trim() || "Saya belum mendapat jawaban dari AI. Coba kirim ulang pesanmu.";
      await wait(700);

      if (scrapedProduct) {
        setFunnelState("comparing");
        const { intro, detail, alternatives } = splitAIResponse(safeReply);
        const detailEntries = detail ? extractDetailEntries(detail) : [];
        const alternativesData = alternatives ? extractAlternatives(alternatives) : null;

        setMsgs((m) => {
          const next: Msg[] = [...m];
          if (intro) {
            next.push({
              id: Date.now() + 1,
              from: "bot",
              text: intro,
              time: now(),
            });
          }
          next.push({
            id: Date.now() + 2,
            from: "bot",
            card: "product",
            product: scrapedProduct,
            details: detailEntries.length ? detailEntries : undefined,
            alternatives: alternativesData ?? undefined,
            time: now(),
          });
          const hasExtras = detailEntries.length > 0 || (alternativesData && alternativesData.rows.length > 0);
          if (hasExtras) {
            next.push({
              id: Date.now() + 3,
              from: "bot",
              text: "Klik *Lihat detail lengkap* untuk rincian produk, atau *Minta alternatif lebih murah* untuk membandingkan opsi lain.",
              time: now(),
            });
          }
          return next;
        });
      } else {
        setMsgs((m) => [
          ...m,
          {
            id: Date.now() + 4,
            from: "bot",
            text: safeReply,
            time: now(),
          },
        ]);
      }

      setHistory((h) => [...h, { role: "assistant", content: safeReply }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi error tak dikenal.";
      setMsgs((m) => [
        ...m,
        {
          id: Date.now() + 3,
          from: "bot",
          text: `AI error: ${message}`,
          time: now(),
        },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const viewProductDetail = (msg: Msg) => {
    if (!msg.details || msg.details.length === 0) {
      if (msg.product?.url) {
        window.open(msg.product.url, "_blank", "noopener,noreferrer");
      }
      return;
    }
    setMsgs((m) => [
      ...m,
      {
        id: Date.now(),
        from: "bot",
        card: "product-detail",
        details: msg.details,
        time: now(),
      },
    ]);
  };

  const askCheaperAlternative = (msg: Msg) => {
    setFunnelState("comparing");
    if (msg.alternatives && msg.alternatives.rows.length > 0) {
      setMsgs((m) => [
        ...m,
        {
          id: Date.now(),
          from: "bot",
          card: "alternatives",
          alternatives: msg.alternatives,
          time: now(),
        },
      ]);
      return;
    }
    if (msg.product) {
      const prompt = `Tolong carikan alternatif lebih murah dari produk ini: ${msg.product.title}. Link referensi: ${msg.product.url}. Prioritaskan yang ready stock di marketplace Jepang.`;
      void send(prompt);
    }
  };

  const pickComparedItem = (item: ComparisonItem) => {
    setFunnelState("confirming");
    void send(`Saya pilih opsi ${item.marketplace} dengan harga ${item.price_display}. Tolong lanjutkan ke tahap konfirmasi checkout.`);
  };

  const compareAgain = () => {
    setFunnelState("comparing");
    void send("Bandingkan lagi 3 opsi termurah dengan kondisi terbaik dan sertakan estimasi total.");
  };

  const goToCheckout = ({
    title,
    priceIDR,
    url,
  }: {
    title: string;
    priceIDR: number;
    url?: string;
  }) => {
    setFunnelState("payment");
    const params = new URLSearchParams({
      product: title || "Produk dari Jepang",
      price: String(Math.max(0, Math.round(priceIDR))),
    });
    if (url) params.set("url", url);
    setMsgs((m) => [
      ...m,
      {
        id: Date.now(),
        from: "bot",
        text: `Siap! Saya arahkan ke halaman pembayaran Mayar untuk *${title}* dengan estimasi harga produk Rp ${priceIDR.toLocaleString("id-ID")}. Total final (termasuk jasa, ongkir, pajak) akan dihitung ulang di halaman checkout sebelum redirect ke Mayar.`,
        time: now(),
      },
    ]);
    navigate(`/checkout?${params.toString()}`);
  };

  const buyProduct = (product: ProductData) => {
    const fees = product.price_jpy
      ? estimateAllInFromJPY(product.price_jpy)
      : null;
    goToCheckout({
      title: product.title || "Produk dari Jepang",
      priceIDR: fees?.basePrice ?? 0,
      url: product.url,
    });
  };

  const buyComparisonItem = (item: ComparisonItem) => {
    const fees = item.price_jpy ? estimateAllInFromJPY(item.price_jpy) : null;
    goToCheckout({
      title: `${item.title} (${item.marketplace})`,
      priceIDR: fees?.basePrice ?? 0,
    });
  };

  const handleScreenshotUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!hasApiKey) {
      setMsgs((m) => [
        ...m,
        {
          id: Date.now(),
          from: "bot",
          text: "Konfigurasi AI belum lengkap. Isi VITE_SUMOPOD_API_KEY atau VITE_OPENAI_API_KEY di file .env lalu restart aplikasi.",
          time: now(),
        },
      ]);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMsgs((m) => [
        ...m,
        {
          id: Date.now(),
          from: "bot",
          text: "File harus berupa gambar screenshot (jpg/png/webp).",
          time: now(),
        },
      ]);
      return;
    }

    setMsgs((m) => [
      ...m,
      {
        id: Date.now(),
        from: "user",
        text: `Saya kirim screenshot produk: ${file.name}`,
        time: now(),
      },
    ]);

    setTyping(true);
    try {
      const extracted = await analyzeProductScreenshot(file, API_KEY);
      setMsgs((m) => [
        ...m,
        {
          id: Date.now() + 1,
          from: "bot",
          text: `Hasil ekstrak screenshot:\n${extracted}\n\nSaya lanjutkan analisis produk dari data ini ya.`,
          time: now(),
        },
      ]);
      setTyping(false);
      await send(
        `Gunakan hasil ekstrak screenshot produk ini sebagai konteks utama, lalu lanjutkan analisis dan estimasi biaya:\n${extracted}`
      );
    } catch (err) {
      setTyping(false);
      const message = err instanceof Error ? err.message : "Gagal menganalisis screenshot.";
      setMsgs((m) => [
        ...m,
        {
          id: Date.now() + 2,
          from: "bot",
          text: `Analisis screenshot gagal: ${message}`,
          time: now(),
        },
      ]);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-10 md:py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs uppercase tracking-widest text-success font-semibold">Demo</span>
          <h1 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4">
            Begini rasanya belanja via WhatsApp.
          </h1>
          <p className="text-muted-foreground">
            Coba klik salah satu pesan cepat di bawah dan lihat alurnya end-to-end.
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="rounded-[2.5rem] bg-foreground p-2.5 shadow-card">
            <div className="rounded-[2rem] overflow-hidden bg-[#e5ddd5] flex flex-col h-[640px]">
              <div className="bg-success px-4 py-3 flex items-center gap-3 text-success-foreground">
                <div className="h-10 w-10 rounded-full bg-background/20 grid place-items-center font-display font-bold">
                  M
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">MyBagasi AI</p>
                  <p className="text-[11px] opacity-90">{typing ? "mengetik..." : `online | ${funnelState}`}</p>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        m.from === "user"
                          ? "bg-[#dcf8c6] text-foreground rounded-br-sm"
                          : "bg-background text-foreground rounded-bl-sm"
                      }`}
                    >
                      {m.text && <MessageText text={m.text} />}
                      {m.card === "quotation" && <QuotationCard />}
                      {m.card === "payment" && <PaymentCard />}
                      {m.card === "tracking" && <TrackingCard />}
                      {m.card === "product" && m.product && (
                        <ProductCard
                          product={m.product}
                          detailsAvailable={Boolean(m.details && m.details.length > 0)}
                          alternativesAvailable={Boolean(
                            m.alternatives && m.alternatives.rows.length > 0
                          )}
                          onViewDetail={() => viewProductDetail(m)}
                          onAskCheaper={() => askCheaperAlternative(m)}
                          onBuyNow={() => m.product && buyProduct(m.product)}
                        />
                      )}
                      {m.card === "product-detail" && m.details && (
                        <ProductDetailBubble items={m.details} />
                      )}
                      {m.card === "alternatives" && m.alternatives && (
                        <AlternativesBubble data={m.alternatives} />
                      )}
                      {m.card === "comparison" && m.comparisons && (
                        <ComparisonCard
                          comparisons={m.comparisons}
                          onPick={pickComparedItem}
                          onBuyPick={buyComparisonItem}
                          onCompareAgain={compareAgain}
                        />
                      )}
                      <div className="flex justify-end items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                        {m.time}
                        {m.from === "user" && <CheckCheck className="h-3 w-3 text-accent" />}
                      </div>
                    </div>
                  </div>
                ))}
                {typing && (
                  <div className="flex">
                    <div className="bg-background rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                      <div className="flex gap-1">
                        {[0, 150, 300].map((d) => (
                          <span
                            key={d}
                            className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-pulse-soft"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-3 py-2 flex gap-2 overflow-x-auto bg-[#e5ddd5]">
                {quickReplies.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    disabled={typing || !hasApiKey}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-background/90 border border-border/40 hover:bg-background disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <div className="p-2 bg-[#f0f0f0] flex items-center gap-2">
                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleScreenshotUpload}
                />
                <button
                  type="button"
                  onClick={() => screenshotInputRef.current?.click()}
                  disabled={typing || !hasApiKey}
                  className="h-10 w-10 rounded-full bg-background border border-border grid place-items-center text-muted-foreground disabled:opacity-50"
                  title="Upload screenshot produk"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  placeholder="Ketik pesan..."
                  disabled={typing || !hasApiKey}
                  className="flex-1 rounded-full bg-background px-4 py-2.5 text-sm outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => send(input)}
                  disabled={typing || !input.trim() || !hasApiKey}
                  className="h-10 w-10 rounded-full bg-success grid place-items-center text-success-foreground shadow-soft disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              {!hasApiKey && (
                <div className="px-3 py-2 bg-warning/10 border-t border-warning/30 text-[11px] text-warning-foreground">
                  API key AI belum diatur. Tambahkan `VITE_SUMOPOD_API_KEY` atau `VITE_OPENAI_API_KEY` di `.env`, lalu restart aplikasi.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default WhatsAppDemo;
