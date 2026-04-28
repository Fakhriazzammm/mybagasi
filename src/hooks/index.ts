export * from './useOrders'
export * from './useQuotations'
export * from './usePayments'

// Membership
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membershipService } from '@/services/membership.service'
import { pointsService } from '@/services/points.service'
import { addressesService } from '@/services/addresses.service'
import { wishlistService, priceAlertsService } from '@/services/wishlist.service'
import { ordersService } from '@/services/orders.service'
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
import { useRealtimeInvalidation } from './useRealtimeInvalidation'

export const useMembershipPlans = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'membership-plans-live', tables: ['membership_plans'], queryKeys: [['membership', 'plans']], queryClient: qc })
  return useQuery({ queryKey: ['membership', 'plans'], queryFn: () => membershipService.getPlans(true) })
}

export const useUserMembership = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'user-membership-live', tables: ['user_memberships'], queryKeys: [['membership', 'user']], queryClient: qc })
  return useQuery({ queryKey: ['membership', 'user'], queryFn: () => membershipService.getUserMembership() })
}

export function useUpgradeMembership() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: membershipService.upgradeTier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['membership'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useUpdateMembershipPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof membershipService.updatePlan>[1] }) => membershipService.updatePlan(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membership', 'plans'] }),
  })
}

export const usePoints = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'points-live', tables: ['points_ledger', 'profiles'], queryKeys: [['points']], queryClient: qc })
  return useQuery({ queryKey: ['points', 'balance'], queryFn: pointsService.getBalance })
}

export const usePointsLedger = () =>
  useQuery({ queryKey: ['points', 'ledger'], queryFn: () => pointsService.getLedger() })

export const useAllPointsLedger = () =>
  useQuery({ queryKey: ['points', 'ledger', 'all'], queryFn: () => pointsService.listAll() })

export const usePointsLiability = () =>
  useQuery({ queryKey: ['points', 'liability'], queryFn: pointsService.getLiability })

export const useAddresses = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'addresses-live', tables: ['addresses'], queryKeys: [['addresses']], queryClient: qc })
  return useQuery({ queryKey: ['addresses'], queryFn: addressesService.list })
}

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

export const useWishlist = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'wishlist-live', tables: ['wishlist_items'], queryKeys: [['wishlist']], queryClient: qc })
  return useQuery({ queryKey: ['wishlist'], queryFn: wishlistService.list })
}

export function useAddWishlistItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: wishlistService.add,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wishlist'] }),
  })
}

export function useUpdateWishlistItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof wishlistService.update>[1] }) => wishlistService.update(id, updates),
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

export const usePriceAlerts = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'price-alerts-live', tables: ['price_alerts'], queryKeys: [['price-alerts']], queryClient: qc })
  return useQuery({ queryKey: ['price-alerts'], queryFn: () => priceAlertsService.list() })
}

export function useCreatePriceAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: priceAlertsService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-alerts'] }),
  })
}

export function useUpdatePriceAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof priceAlertsService.update>[1] }) => priceAlertsService.update(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-alerts'] }),
  })
}

export function usePausePriceAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => priceAlertsService.pause(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-alerts'] }),
  })
}

export function useResumePriceAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => priceAlertsService.resume(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-alerts'] }),
  })
}

export function useDeletePriceAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: priceAlertsService.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-alerts'] }),
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ordersService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })
}

export const useBatchShipments = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'batch-shipments-live', tables: ['batch_shipments', 'batch_participants'], queryKeys: [['batch-shipments']], queryClient: qc })
  return useQuery({ queryKey: ['batch-shipments'], queryFn: () => batchShippingService.list() })
}

export function useJoinBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: batchShippingService.join,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-shipments'] }),
  })
}

export const usePreorders = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'preorders-live', tables: ['preorders', 'preorder_bookings'], queryKeys: [['preorders']], queryClient: qc })
  return useQuery({ queryKey: ['preorders'], queryFn: preordersService.list })
}

export function useBookPreorder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: preordersService.book,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preorders'] }),
  })
}

// Admin hooks
export const useProcurementQueue = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'procurement-live', tables: ['procurement_queue', 'orders', 'order_tracking'], queryKeys: [['procurement'], ['orders']], queryClient: qc })
  return useQuery({ queryKey: ['procurement'], queryFn: () => procurementService.list() })
}

export function useUpdateProcurementStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Parameters<typeof procurementService.updateStatus>[1] }) =>
      procurementService.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procurement'] }),
  })
}

export function useAssignProcurement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, assignedTo }: { id: string; assignedTo: string }) => procurementService.assign(id, assignedTo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procurement'] }),
  })
}

export function useMarkProcurementPurchased() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, purchaseRef }: { id: string; purchaseRef?: string }) => procurementService.markPurchased(id, purchaseRef),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

export const useSupportNotes = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'support-notes-live', tables: ['support_notes'], queryKeys: [['support-notes']], queryClient: qc })
  return useQuery({ queryKey: ['support-notes'], queryFn: () => supportService.list() })
}

export function useCreateSupportNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: supportService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-notes'] }),
  })
}

export function useUpdateSupportStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Parameters<typeof supportService.updateStatus>[1] }) =>
      supportService.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-notes'] }),
  })
}

export const useTrackingExceptions = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'tracking-exceptions-live', tables: ['tracking_exceptions'], queryKeys: [['tracking-exceptions']], queryClient: qc })
  return useQuery({ queryKey: ['tracking-exceptions'], queryFn: () => trackingExceptionsService.list() })
}

export function useResolveTrackingException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: trackingExceptionsService.resolve,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-exceptions'] }),
  })
}

export const useScraperFailures = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'scraper-failures-live', tables: ['scraper_failures'], queryKeys: [['scraper-failures']], queryClient: qc })
  return useQuery({ queryKey: ['scraper-failures'], queryFn: () => scraperService.list() })
}

export function useRetryScraperFailure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: scraperService.incrementRetry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scraper-failures'] }),
  })
}

export function useResolveScraperFailure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: scraperService.resolve,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scraper-failures'] }),
  })
}

export const useQuoteApprovals = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'quote-approvals-live', tables: ['quote_approvals'], queryKeys: [['quote-approvals']], queryClient: qc })
  return useQuery({ queryKey: ['quote-approvals'], queryFn: quoteApprovalsService.list })
}

export function useReviewQuoteApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      quoteApprovalsService.review(id, approved),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quote-approvals'] }),
  })
}

export const useAdminStats = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'admin-stats-live', tables: ['quotations', 'orders', 'payments', 'procurement_queue', 'tracking_exceptions', 'scraper_failures', 'quote_approvals', 'support_notes'], queryKeys: [['admin-stats']], queryClient: qc })
  return useQuery({ queryKey: ['admin-stats'], queryFn: adminStatsService.get })
}

// Super admin hooks
export const useUsers = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'users-live', tables: ['profiles'], queryKeys: [['users']], queryClient: qc })
  return useQuery({ queryKey: ['users'], queryFn: userManagementService.listUsers })
}

export const useMarketplaces = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'marketplaces-live', tables: ['marketplaces'], queryKeys: [['marketplaces']], queryClient: qc })
  return useQuery({ queryKey: ['marketplaces'], queryFn: marketplacesService.list })
}

export function useCreateMarketplace() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: marketplacesService.create, onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplaces'] }) })
}

export function useUpdateMarketplace() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof marketplacesService.update>[1] }) => marketplacesService.update(id, updates), onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplaces'] }) })
}

export function useToggleMarketplace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      marketplacesService.toggle(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplaces'] }),
  })
}

export const usePricingRules = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'pricing-rules-live', tables: ['pricing_rules'], queryKeys: [['pricing-rules']], queryClient: qc })
  return useQuery({ queryKey: ['pricing-rules'], queryFn: pricingRulesService.list })
}

export function useCreatePricingRule() { const qc = useQueryClient(); return useMutation({ mutationFn: pricingRulesService.create, onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }) }) }
export function useUpdatePricingRule() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof pricingRulesService.update>[1] }) => pricingRulesService.update(id, updates), onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }) }) }
export function useDeletePricingRule() { const qc = useQueryClient(); return useMutation({ mutationFn: pricingRulesService.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }) }) }

export const useFeeSettings = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'fee-settings-live', tables: ['fee_settings'], queryKeys: [['fee-settings']], queryClient: qc })
  return useQuery({ queryKey: ['fee-settings'], queryFn: feeSettingsService.getAll })
}

export function useUpdateFeeSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      feeSettingsService.update(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-settings'] }),
  })
}

export const useShippingRoutes = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'shipping-routes-live', tables: ['shipping_routes'], queryKeys: [['shipping-routes']], queryClient: qc })
  return useQuery({ queryKey: ['shipping-routes'], queryFn: shippingRoutesService.list })
}

export function useCreateShippingRoute() { const qc = useQueryClient(); return useMutation({ mutationFn: shippingRoutesService.create, onSuccess: () => qc.invalidateQueries({ queryKey: ['shipping-routes'] }) }) }
export function useUpdateShippingRoute() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof shippingRoutesService.update>[1] }) => shippingRoutesService.update(id, updates), onSuccess: () => qc.invalidateQueries({ queryKey: ['shipping-routes'] }) }) }

export function useToggleShippingRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      shippingRoutesService.toggle(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipping-routes'] }),
  })
}

export const useAffiliatePayouts = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'affiliate-payouts-live', tables: ['affiliate_payouts'], queryKeys: [['affiliate-payouts']], queryClient: qc })
  return useQuery({ queryKey: ['affiliate-payouts'], queryFn: () => affiliateService.listPayouts() })
}

export function useApproveAffiliatePayout() { const qc = useQueryClient(); return useMutation({ mutationFn: affiliateService.approvePayout, onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-payouts'] }) }) }
export function useMarkAffiliatePayoutPaid() { const qc = useQueryClient(); return useMutation({ mutationFn: affiliateService.markPaid, onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-payouts'] }) }) }

export const useAffiliateCommissionTiers = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'affiliate-tiers-live', tables: ['affiliate_commission_tiers'], queryKeys: [['affiliate-tiers']], queryClient: qc })
  return useQuery({ queryKey: ['affiliate-tiers'], queryFn: affiliateService.getTiers })
}

export function useCreateAffiliateTier() { const qc = useQueryClient(); return useMutation({ mutationFn: affiliateService.createTier, onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-tiers'] }) }) }
export function useUpdateAffiliateTier() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof affiliateService.updateTier>[1] }) => affiliateService.updateTier(id, updates), onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-tiers'] }) }) }

export const useAiSettings = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'ai-settings-live', tables: ['ai_settings'], queryKeys: [['ai-settings']], queryClient: qc })
  return useQuery({ queryKey: ['ai-settings'], queryFn: aiSettingsService.getAll })
}

export function useUpdateAiSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      aiSettingsService.update(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}

export function useCreateAiSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { key: string; value: string; description?: string | null }) =>
      aiSettingsService.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}

export function useDeleteAiSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aiSettingsService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}

export const useSuperAdminStats = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'superadmin-stats-live', tables: ['profiles', 'user_memberships', 'marketplaces'], queryKeys: [['superadmin-stats']], queryClient: qc })
  return useQuery({ queryKey: ['superadmin-stats'], queryFn: superAdminStatsService.get })
}

export const useMembershipRevenue = () => {
  const qc = useQueryClient()
  useRealtimeInvalidation({ channel: 'membership-revenue-live', tables: ['user_memberships', 'membership_plans'], queryKeys: [['membership-revenue']], queryClient: qc })
  return useQuery({ queryKey: ['membership-revenue'], queryFn: membershipService.getMembershipRevenue })
}
