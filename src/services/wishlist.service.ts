import { supabase } from '@/lib/supabase'
import type { WishlistItem, PriceAlert, AlertStatus } from '@/types/database.types'

export const wishlistService = {
  async list(): Promise<WishlistItem[]> {
    const { data, error } = await supabase
      .from('wishlist_items')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async add(payload: Pick<WishlistItem, 'name' | 'emoji' | 'url' | 'price_idr' | 'source' | 'note'>): Promise<WishlistItem> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('wishlist_items')
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('wishlist_items')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async update(id: string, payload: Partial<Pick<WishlistItem, 'name' | 'emoji' | 'note' | 'price_idr'>>): Promise<WishlistItem> {
    const { data, error } = await supabase
      .from('wishlist_items')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

export const priceAlertsService = {
  async list(status?: AlertStatus): Promise<PriceAlert[]> {
    let query = supabase
      .from('price_alerts')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async create(payload: Pick<PriceAlert, 'product' | 'url' | 'current_price' | 'target_price'>): Promise<PriceAlert> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('price_alerts')
      .insert({ ...payload, user_id: user.id, status: 'monitoring' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('price_alerts')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async trigger(id: string, currentPrice: number): Promise<PriceAlert> {
    const { data, error } = await supabase
      .from('price_alerts')
      .update({
        status: 'triggered',
        current_price: currentPrice,
        triggered_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
