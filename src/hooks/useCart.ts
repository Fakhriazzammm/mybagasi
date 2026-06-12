import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cartService } from '@/services/cart.service'
import type { CartItem, AddToCartInput } from '@/services/cart.service'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation'

export const CART_KEYS = {
  all: ['cart'] as const,
  items: ['cart', 'items'] as const,
  count: ['cart', 'count'] as const,
}

export function useCartItems() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  useRealtimeInvalidation({
    channel: 'cart-items-live',
    tables: ['cart_items'],
    queryKeys: [CART_KEYS.all, CART_KEYS.items, CART_KEYS.count],
    queryClient,
  })
  return useQuery({
    queryKey: CART_KEYS.items,
    queryFn: () => cartService.getCartItems(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

export function useCartCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: CART_KEYS.count,
    queryFn: () => cartService.getCartCount(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

export function useAddToCart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AddToCartInput) => cartService.addToCart(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CART_KEYS.all })
    },
  })
}

export function useUpdateQuantity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      cartService.updateCartItemQuantity(itemId, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CART_KEYS.all })
    },
  })
}

export function useRemoveItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => cartService.removeCartItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CART_KEYS.all })
    },
  })
}

export function useClearCart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => cartService.clearCart(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CART_KEYS.all })
    },
  })
}
