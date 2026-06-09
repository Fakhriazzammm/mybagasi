import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
      subscribe: () => ({}),
    }),
    removeChannel: () => {},
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  },
}));

const mutationStub = {
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
};

vi.mock("@/hooks", () => ({
  useOrders: () => ({
    data: [
      {
        id: "ORD-8821",
        product: "Onitsuka Tiger Mexico 66",
        total: 1547000,
        status: "shipped_to_indonesia",
        created_at: "2026-04-18T03:00:00.000Z",
        eta: "2026-04-26",
        tracking_number: "JP9821774421ID",
      },
    ],
    isLoading: false,
  }),
  useOrder: () => ({ data: undefined, isLoading: false }),
  useQuotations: () => ({ data: [], isLoading: false }),
  useWishlist: () => ({ data: [], isLoading: false }),
  useRemoveWishlistItem: () => mutationStub,
  usePayments: () => ({ data: [], isLoading: false }),
  useAddresses: () => ({ data: [], isLoading: false }),
  useDeleteAddress: () => mutationStub,
  useSetPrimaryAddress: () => mutationStub,
  useAiSettings: () => ({ data: [], isLoading: false }),
  useCreateAiSetting: () => mutationStub,
  useDeleteAiSetting: () => mutationStub,
  useSuperAdminStats: () => ({ data: { totalUsers: 1000 } }),
  useUpdateAiSetting: () => mutationStub,
}));

vi.mock("@/hooks/useQuotations", () => ({
  useCreateSmartQuotation: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ quotation: { id: "Q-TEST-001" } }),
    isPending: false,
  }),
}));

afterEach(() => {
  cleanup();
});

const renderRoute = async (path: string) => {
  const { default: App } = await import("@/App");
  window.history.pushState({}, "Test", path);
  render(<App />);
};

describe("Route smoke test", () => {
  it("renders public home route", async () => {
    await renderRoute("/");
    expect(screen.getByText(/Belanja barang Jepang/i)).toBeInTheDocument();
  });

  it("renders AI personal shopper route", async () => {
    await renderRoute("/aipersonalshopper");
    expect(screen.getByText(/AI Personal Shopper/i)).toBeInTheDocument();
  });

  it("renders transparent pricing route", async () => {
    await renderRoute("/biaya-transparan");
    expect(screen.getByRole("heading", { name: /Biaya Transparan/i })).toBeInTheDocument();
  });

  it("renders ops command center route", async () => {
    await renderRoute("/super-admin/ops-center");
    expect(screen.getByText(/Ops Command Center/i)).toBeInTheDocument();
  });

  it("renders dashboard orders route", async () => {
    await renderRoute("/dashboard/orders");
    expect(screen.getByText(/Riwayat pesanan/i)).toBeInTheDocument();
  });

  it("renders dashboard order detail route", async () => {
    await renderRoute("/dashboard/orders/ORD-8821");
    expect(screen.getByText(/Tracking timeline realtime/i)).toBeInTheDocument();
  });
});
