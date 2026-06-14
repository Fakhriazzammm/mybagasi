import { describe, expect, it } from "vitest";
import { estimateAllInFromJPY, extractUrl } from "./ai";

describe("extractUrl", () => {
  it("extracts first URL from text", () => {
    const text =
      "Bisa cek ini ya https://jp.mercari.com/item/m12345 dan bandingin juga.";
    expect(extractUrl(text)).toBe("https://jp.mercari.com/item/m12345");
  });

  it("returns null when there is no URL", () => {
    expect(extractUrl("tolong cariin sneaker warna hitam")).toBeNull();
  });
});

describe("estimateAllInFromJPY", () => {
  it("calculates expected all-in amount with fee, shipping and tax", () => {
    const estimate = estimateAllInFromJPY(10_000);
    expect(estimate.basePrice).toBe(1_050_000);
    expect(estimate.serviceFee).toBe(120_000);
    expect(estimate.shipping).toBe(105_000);
    expect(estimate.tax).toBe(75_000);
    expect(estimate.total).toBe(1_350_000);
  });
});
