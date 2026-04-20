export * from './useOrders'
export * from './useQuotations'
export * from './usePayments'

// Membership
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membershipService } from '@/services/membership.service'
import { pointsService } from '@/services/points.service'
import { addressesService } from '@/services/addresses.service'
import { wishlistService, priceAlertsService } from '@/services/wishlist.service'
import { batchShippingService } from '@/services/batch-shipping.service'
import { preordersService } from '@/services/preorders.service'
import {
  procurementService, supportService,
  trackingExceptionsService, scraperService,
  quoteApprovalsService, adminStatsService,
} from '@/services/admin.service'
import {
  marketplacesService, pricingRulesService, feeSettingsService,
  shippingRoutesService, affiliateService, aiSettingsService,
  superAdminStatsService,
} from '@/services/superadmin.service'
import { userManagementService } from '@/services/auth.service'

export const useMembershipPlans = () =>
  useQuery({ queryKey: ['membership', 'plans'], queryFn: membershipService.getPlans })

export const useUserMembership = () =>
  useQuery({ queryKey: ['membership', 'user'], queryFn: () => membershipService.getUserMembership() })

export const usePoints = () =>
  useQuery({ queryKey: ['points', 'balance'], queryFn: pointsService.getBalance })

export const usePointsLedger = () =>
  useQuery({ queryKey: ['points', 'ledger'], queryFn: () => pointsService.getLedger() })

export const useAllPointsLedger = () =>
  useQuery({ queryKey: ['points', 'ledger', 'all'], queryFn: () => pointsService.listAll() })

export const usePointsLiability = () =>
  useQuery({ queryKey: ['points', 'liability'], queryFn: pointsService.getLiability })

export const useAddresses = () =>
  useQuery({ queryKey: ['addresses'], queryFn: addressesService.list })

export function useCreateAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: addressesService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  })
}

export function useDeleteAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: addressesService.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  })
}

export function useSetPrimaryAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: addressesService.setPrimary,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  })
}

export const useWishlist = () =>
  useQuery({ queryKey: ['wishlist'], queryFn: wishlistService.list })

export function useAddWishlistItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: wishlistService.add,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wishlist'] }),
  })
}

export function useRemoveWishlistItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: wishlistService.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wishlist'] }),
  })
}

export const usePriceAlerts = () =>
  useQuery({ queryKey: ['price-alerts'], queryFn: () => priceAlertsService.list() })

export function useCreatePriceAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: priceAlertsService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-alerts'] }),
  })
}

export const useBatchShipments = () =>
  useQuery({ queryKey: ['batch-shipments'], queryFn: () => batchShippingService.list() })

export function useJoinBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: batchShippingService.join,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-shipments'] }),
  })
}

export const usePreorders = () =>
  useQuery({ queryKey: ['preorders'], queryFn: preordersService.list })

export function useBookPreorder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: preordersService.book,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preorders'] }),
  })
}

// Admin hooks
export const useProcurementQueue = () =>
  useQuery({ queryKey: ['procurement'], queryFn: () => procurementService.list() })

export function useUpdateProcurementStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: Parameters<typeof procurementService.updateStatus>[0] extends infer P ? { id: string; status: Parameters<typeof procurementService.updateStatus>[1] } : never) =>
      procurementService.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procurement'] }),
  })
}

export const useSupportNotes = () =>
  useQuery({ queryKey: ['support-notes'], queryFn: () => supportService.list() })

export function useUpdateSupportStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Parameters<typeof supportService.updateStatus>[1] }) =>
      supportService.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-notes'] }),
  })
}

export const useTrackingExceptions = () =>
  useQuery({ queryKey: ['tracking-exceptions'], queryFn: () => trackingExceptionsService.list() })

export const useScraperFailures = () =>
  useQuery({ queryKey: ['scraper-failures'], queryFn: () => scraperService.list() })

export const useQuoteApprovals = () =>
  useQuery({ queryKey: ['quote-approvals'], queryFn: quoteApprovalsService.list })

export function useReviewQuoteApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      quoteApprovalsService.review(id, approved),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quote-approvals'] }),
  })
}

export const useAdminStats = () =>
  useQuery({ queryKey: ['admin-stats'], queryFn: adminStatsService.get })

// Super admin hooks
export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: userManagementService.listUsers })

export const useMarketplaces = () =>
  useQuery({ queryKey: ['marketplaces'], queryFn: marketplacesService.list })

export function useToggleMarketplace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      marketplacesService.toggle(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplaces'] }),
  })
}

export const usePricingRules = () =>
  useQuery({ queryKey: ['pricing-rules'], queryFn: pricingRulesService.list })

export const useFeeSettings = () =>
  useQuery({ queryKey: ['fee-settings'], queryFn: feeSettingsService.getAll })

export function useUpdateFeeSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      feeSettingsService.update(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-settings'] }),
  })
}

export const useShippingRoutes = () =>
  useQuery({ queryKey: ['shipping-routes'], queryFn: shippingRoutesService.list })

export function useToggleShippingRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      shippingRoutesService.toggle(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipping-routes'] }),
  })
}

export const useAffiliatePayouts = () =>
  useQuery({ queryKey: ['affiliate-payouts'], queryFn: () => affiliateService.listPayouts() })

export const useAffiliateCommissionTiers = () =>
  useQuery({ queryKey: ['affiliate-tiers'], queryFn: affiliateService.getTiers })

export const useAiSettings = () =>
  useQuery({ queryKey: ['ai-settings'], queryFn: aiSettingsService.getAll })

export function useUpdateAiSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      aiSettingsService.update(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}

export const useSuperAdminStats = () =>
  useQuery({ queryKey: ['superadmin-stats'], queryFn: superAdminStatsService.get })

export const useMembershipRevenue = () =>
  useQuery({ queryKey: ['membership-revenue'], queryFn: membershipService.getMembershipRevenue })
