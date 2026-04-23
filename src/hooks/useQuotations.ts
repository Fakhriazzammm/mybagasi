import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { quotationsService } from '@/services/quotations.service'
import type { QuotationStatus } from '@/types/database.types'
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation'

export const QUOTATION_KEYS = {
  all: ['quotations'] as const,
  list: (status?: QuotationStatus) => ['quotations', 'list', status] as const,
  detail: (id: string) => ['quotations', 'detail', id] as const,
}

export function useQuotations(status?: QuotationStatus) {
  const queryClient = useQueryClient()
  useRealtimeInvalidation({
    channel: 'quotations-live',
    tables: ['quotations'],
    queryKeys: [QUOTATION_KEYS.all, QUOTATION_KEYS.list(status)],
    queryClient,
  })
  return useQuery({
    queryKey: QUOTATION_KEYS.list(status),
    queryFn: () => quotationsService.list(status),
  })
}

export function useAllQuotations(status?: QuotationStatus) {
  return useQuery({
    queryKey: ['quotations', 'all', status],
    queryFn: () => quotationsService.listAll(status),
  })
}

export function useCreateQuotation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: quotationsService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUOTATION_KEYS.all }),
  })
}
