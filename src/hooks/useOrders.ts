import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ordersService } from '@/services/orders.service'
import type { OrderStatus } from '@/types/database.types'
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation'

export const ORDER_KEYS = {
  all: ['orders'] as const,
  list: (status?: OrderStatus) => ['orders', 'list', status] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  stats: () => ['orders', 'stats'] as const,
}

export function useOrders(status?: OrderStatus) {
  const queryClient = useQueryClient()
  useRealtimeInvalidation({
    channel: 'orders-live',
    tables: ['orders', 'order_tracking'],
    queryKeys: [ORDER_KEYS.all, ORDER_KEYS.list(status), ORDER_KEYS.stats()],
    queryClient,
  })
  return useQuery({
    queryKey: ORDER_KEYS.list(status),
    queryFn: () => ordersService.list(status),
  })
}

export function useAllOrders(status?: OrderStatus) {
  return useQuery({
    queryKey: ['orders', 'all', status],
    queryFn: () => ordersService.listAll(status),
  })
}

export function useOrder(id: string) {
  const queryClient = useQueryClient()
  useRealtimeInvalidation({
    channel: `order-detail-live-${id}`,
    tables: id ? ['orders', 'order_tracking'] : [],
    queryKeys: id ? [ORDER_KEYS.detail(id)] : [],
    queryClient,
  })

  return useQuery({
    queryKey: ORDER_KEYS.detail(id),
    queryFn: () => ordersService.get(id),
    enabled: !!id,
  })
}

export function useOrderStats() {
  return useQuery({
    queryKey: ORDER_KEYS.stats(),
    queryFn: () => ordersService.getStats(),
  })
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: OrderStatus; note?: string }) =>
      ordersService.updateStatus(id, status, note),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ORDER_KEYS.all })
      queryClient.invalidateQueries({ queryKey: ORDER_KEYS.detail(id) })
    },
  })
}
