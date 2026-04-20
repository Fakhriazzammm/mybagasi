const BASE_URL = "https://ai.sumopod.com/v1";
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `Kamu adalah MyBagasi AI, asisten belanja personal untuk produk-produk Jepang.
Kamu membantu pelanggan Indonesia untuk:
- Menemukan produk dari marketplace Jepang (Mercari, Rakuten, Amazon JP, Yahoo Auction, ZOZOTOWN, Muji, Map Camera)
- Memberikan estimasi harga realistis termasuk semua biaya (harga produk, jasa MyBagasi, ongkir Jepang→Indo, pajak & bea)
- Membantu proses pembelian, pembayaran, dan tracking pengiriman
- Menjawab pertanyaan tentang produk Jepang

Selalu respond dalam Bahasa Indonesia yang ramah dan santai.
Jika ada link produk (mercari.com, rakuten.co.jp, amazon.co.jp, dll), konfirmasi kamu akan scrape detailnya.
Jika ditanya harga, berikan estimasi realistis dalam Rupiah (kurs ¥1 ≈ Rp 105).
Fee jasa MyBagasi sekitar 15% dari harga produk. Ongkir Jepang→Indo sekitar Rp 200.000–500.000 tergantung berat.
Jawab singkat dan to the point, tidak perlu panjang lebar.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendMessage(
  messages: ChatMessage[],
  apiKey: string
): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 400,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`AI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}

export async function* streamMessage(
  messages: ChatMessage[],
  apiKey: string
): AsyncGenerator<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 400,
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`AI API error ${res.status}: ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value).split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const chunk = JSON.parse(payload);
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) yield token;
      } catch {
        // malformed chunk — skip
      }
    }
  }
}
