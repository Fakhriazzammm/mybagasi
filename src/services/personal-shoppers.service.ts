import { supabase } from '@/lib/supabase'
import type { PersonalShopper, ShopperReview } from '@/types/database.types'

export const personalShoppersService = {
  async list(): Promise<PersonalShopper[]> {
    const { data, error } = await supabase
      .from('personal_shoppers')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async getBySlug(slug: string): Promise<PersonalShopper> {
    const { data, error } = await supabase
      .from('personal_shoppers')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
    if (error) throw error
    return data
  },

  async getById(id: string): Promise<PersonalShopper> {
    const { data, error } = await supabase
      .from('personal_shoppers')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async getReviews(shopperId: string): Promise<(ShopperReview & { profiles: { name: string; avatar_url: string | null } })[]> {
    const { data, error } = await supabase
      .from('shopper_reviews')
      .select('*, profiles(name, avatar_url)')
      .eq('shopper_id', shopperId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getUserReview(shopperId: string): Promise<(ShopperReview & { profiles: { name: string; avatar_url: string | null } }) | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('shopper_reviews')
      .select('*, profiles(name, avatar_url)')
      .eq('shopper_id', shopperId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createReview(shopperId: string, rating: number, review?: string): Promise<ShopperReview> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('shopper_reviews')
      .insert({ shopper_id: shopperId, user_id: user.id, rating, review })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateReview(reviewId: string, rating: number, review?: string): Promise<ShopperReview> {
    const { data, error } = await supabase
      .from('shopper_reviews')
      .update({ rating, review })
      .eq('id', reviewId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteReview(reviewId: string): Promise<void> {
    const { error } = await supabase
      .from('shopper_reviews')
      .delete()
      .eq('id', reviewId)
    if (error) throw error
  },
}
