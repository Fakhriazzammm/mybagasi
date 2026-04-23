import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { paymentsService, refundsService } from '@/services/payments.service'
import type { PaymentStatus, RefundStatus } from '@/types/database.types'
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation'

export const PAYMENT_KEYS = {
  all: ['payments'] as const,
  list: (status?: PaymentStatus) => ['payments', 'list', status] as const,
  stats: () => ['payments', 'stats'] as const,
}

export function usePayments(status?: PaymentStatus) {
  const queryClient = useQueryClient()
  useRealtimeInvalidation({
    channel: 'payments-live',
    tables: ['payments'],
    queryKeys: [PAYMENT_KEYS.all, PAYMENT_KEYS.list(status), PAYMENT_KEYS.stats()],
    queryClient,
  })
  return useQuery({
    queryKey: PAYMENT_KEYS.list(status),
    queryFn: () => paymentsService.listAll(status),
  })
}

export function usePaymentStats() {
  return useQuery({
    queryKey: PAYMENT_KEYS.stats(),
    queryFn: () => paymentsService.getStats(),
  })
}

export function useSettlePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, gatewayRef }: { id: string; gatewayRef?: string }) =>
      paymentsService.settle(id, gatewayRef),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PAYMENT_KEYS.all }),
  })
}

export const REFUND_KEYS = {
  all: ['refunds'] as const,
  list: (status?: RefundStatus) => ['refunds', 'list', status] as const,
}

export function useRefunds(status?: RefundStatus) {
  return useQuery({
    queryKey: REFUND_KEYS.list(status),
    queryFn: () => refundsService.listAll(status),
  })
}

export function useUpdateRefundStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: RefundStatus }) =>
      refundsService.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REFUND_KEYS.all }),
  })
}
