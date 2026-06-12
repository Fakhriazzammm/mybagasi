import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CartItem {
  id: string
  user_id: string
  catalog_item_id: string | null
  product_name: string
  price_jpy: number
  price_idr: number
  image_url: string
  category: string
  shipping_category: string
  quantity: number
  estimated_fee: number
  estimated_shipping: number
  estimated_tax: number
  estimated_total: number
  notes: string
  created_at: string
  updated_at: string
}

export interface AddToCartInput {
  catalog_item_id?: string
  product_name: string
  price_jpy?: number
  price_idr?: number
  image_url?: string
  category?: string
  shipping_category?: string
  quantity?: number
  estimated_fee?: number
  estimated_shipping?: number
  estimated_tax?: number
  estimated_total?: number
  notes?: string
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getUserId(): Promise<string> {
  return supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) throw new Error('Not authenticated')
    return user.id
  })
}

// ─────────────────────────────────────────────
// Cart Service
// ─────────────────────────────────────────────

export const cartService = {
  /**
   * Fetch all cart items for the current user, ordered by created_at.
   * RLS handles user filtering automatically via auth.uid().
   */
  async getCartItems(): Promise<CartItem[]> {
    const { data, error } = await supabase
      .from('cart_items')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw error
    return data ?? []
  },

  /**
   * Add an item to the cart (or increment quantity if same product_name + user already exists).
   * Returns the saved CartItem.
   */
  async addToCart(item: AddToCartInput): Promise<CartItem> {
    const userId = await getUserId()

    // Check if same product_name already exists for this user
    const { data: existing } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', userId)
      .eq('product_name', item.product_name)
      .maybeSingle()

    if (existing) {
      // Increment quantity
      const newQty = existing.quantity + (item.quantity ?? 1)
      const { data, error } = await supabase
        .from('cart_items')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      return data
    }

    // Insert new row
    const { data, error } = await supabase
      .from('cart_items')
      .insert({
        user_id: userId,
        catalog_item_id: item.catalog_item_id ?? null,
        product_name: item.product_name,
        price_jpy: item.price_jpy ?? 0,
        price_idr: item.price_idr ?? 0,
        image_url: item.image_url ?? '',
        category: item.category ?? '',
        shipping_category: item.shipping_category ?? 'general',
        quantity: item.quantity ?? 1,
        estimated_fee: item.estimated_fee ?? 0,
        estimated_shipping: item.estimated_shipping ?? 0,
        estimated_tax: item.estimated_tax ?? 0,
        estimated_total: item.estimated_total ?? 0,
        notes: item.notes ?? '',
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update the quantity of a specific cart item.
   */
  async updateCartItemQuantity(itemId: string, quantity: number): Promise<void> {
    const { error } = await supabase
      .from('cart_items')
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq('id', itemId)

    if (error) throw error
  },

  /**
   * Remove a specific item from the cart by its id.
   */
  async removeCartItem(itemId: string): Promise<void> {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error
  },

  /**
   * Clear all cart items for the current user.
   */
  async clearCart(): Promise<void> {
    const userId = await getUserId()

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', userId)

    if (error) throw error
  },

  /**
   * Get the total item count for the current user's cart (for badge display).
   */
  async getCartCount(): Promise<number> {
    const { count, error } = await supabase
      .from('cart_items')
      .select('*', { count: 'exact', head: true })

    if (error) throw error
    return count ?? 0
  },
}
