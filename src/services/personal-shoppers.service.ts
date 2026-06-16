import { supabase } from '@/lib/supabase'
import type { PersonalShopper, ShopperReview, BatchShipment } from '@/types/database.types'

export interface ReviewWithProfile {
  id: string
  shopper_id: string
  user_id: string | null
  rating: number
  review: string | null
  guest_name: string | null
  guest_email: string | null
  created_at: string
  profiles: { name: string; avatar_url: string | null } | null
}

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

  async getReviews(shopperId: string): Promise<ReviewWithProfile[]> {
    const { data, error } = await supabase
      .from('shopper_reviews')
      .select('*, profiles(name, avatar_url)')
      .eq('shopper_id', shopperId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getUserReview(shopperId: string): Promise<ReviewWithProfile | null> {
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

  async createReview(
    shopperId: string,
    rating: number,
    options?: { review?: string; guestName?: string; guestEmail?: string }
  ): Promise<ShopperReview> {
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // Authenticated user — create with user_id
      const { data, error } = await supabase
        .from('shopper_reviews')
        .insert({
          shopper_id: shopperId,
          user_id: user.id,
          rating,
          review: options?.review ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    }

    // Guest user — name is required
    if (!options?.guestName?.trim()) {
      throw new Error('Nama wajib diisi')
    }

    const { data, error } = await supabase
      .from('shopper_reviews')
      .insert({
        shopper_id: shopperId,
        user_id: null,
        guest_name: options.guestName.trim(),
        guest_email: options.guestEmail?.trim() || null,
        rating,
        review: options?.review ?? null,
      })
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

  async getSchedules(shopperId: string): Promise<BatchShipment[]> {
    const { data, error } = await supabase
      .from('batch_shopper_schedules')
      .select(`
        is_primary,
        batch_shipments!inner(*)
      `)
      .eq('shopper_id', shopperId)
      .order('batch_shipments.departure_date', { ascending: true })
    if (error) throw error
    return (data ?? []).map((s: any) => s.batch_shipments)
  },
}
