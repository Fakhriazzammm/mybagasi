import { supabase } from '@/lib/supabase'
import type { PersonalShopper, ShopperReview, BatchShipment, BatchShopperSchedule, FeeSetting } from '@/types/database.types'

export interface ShopperDashboardStats {
  ordersCompleted: number
  totalRating: number
  reviewsCount: number
  activeSchedules: number
}

export interface ShopperScheduleWithShipment {
  is_primary: boolean
  batch_shipment: BatchShipment
}

export interface ShopperReviewWithProfile {
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

export interface ShopperScheduleCreateInput {
  batch_id: string
  shopper_id: string
  is_primary?: boolean
}

export { FeeSetting }

export const shopperService = {
  async getMyProfile(userId: string): Promise<PersonalShopper | null> {
    const { data, error } = await supabase
      .from('personal_shoppers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  /**
   * Get a personal shopper by slug (e.g. 'mybagasi-jastip')
   */
  async getShopperBySlug(slug: string): Promise<PersonalShopper | null> {
    const { data, error } = await supabase
      .from('personal_shoppers')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw error
    return data
  },

  /**
   * Update a personal shopper profile
   */
  async updateProfile(shopperId: string, data: Partial<PersonalShopper>): Promise<PersonalShopper | null> {
    const { data: result, error } = await supabase
      .from('personal_shoppers')
      .update(data)
      .eq('id', shopperId)
      .select()
      .maybeSingle()
    if (error) throw error
    return result
  },

  async getMyOrders(shopperId: string): Promise<ShopperScheduleWithShipment[]> {
    const { data, error } = await supabase
      .from('batch_shopper_schedules')
      .select(`
        is_primary,
        batch_shipments!inner(*)
      `)
      .eq('shopper_id', shopperId)
      .order('batch_shipments.departure_date', { ascending: false })
    if (error) throw error
    return (data ?? []).map((s: any) => ({
      is_primary: s.is_primary,
      batch_shipment: s.batch_shipments,
    }))
  },

  async getMyReviews(shopperId: string): Promise<ShopperReviewWithProfile[]> {
    const { data, error } = await supabase
      .from('shopper_reviews')
      .select('*, profiles(name, avatar_url)')
      .eq('shopper_id', shopperId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  /**
   * Get reviews for a shopper with pagination
   */
  async getReviews(shopperId: string, page: number = 1, limit: number = 10): Promise<{
    data: ShopperReviewWithProfile[]
    total: number
    page: number
    limit: number
    totalPages: number
  }> {
    const from = (page - 1) * limit
    const to = from + limit - 1

    // Get total count
    const { count: total, error: countError } = await supabase
      .from('shopper_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('shopper_id', shopperId)
    if (countError) throw countError

    // Get paginated data
    const { data, error } = await supabase
      .from('shopper_reviews')
      .select('*, profiles(name, avatar_url)')
      .eq('shopper_id', shopperId)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error

    return {
      data: data ?? [],
      total: total ?? 0,
      page,
      limit,
      totalPages: Math.ceil((total ?? 0) / limit),
    }
  },

  async getMyStats(shopperId: string): Promise<ShopperDashboardStats> {
    // Get reviews stats
    const { data: reviews, error: reviewsError } = await supabase
      .from('shopper_reviews')
      .select('rating')
      .eq('shopper_id', shopperId)
    if (reviewsError) throw reviewsError

    const reviewsCount = reviews?.length ?? 0
    const totalRating = reviewsCount > 0
      ? reviews!.reduce((sum, r) => sum + r.rating, 0) / reviewsCount
      : 0

    // Get completed orders (from shopper schedules linked to closed/shipping shipments)
    const { data: schedules, error: schedulesError } = await supabase
      .from('batch_shopper_schedules')
      .select(`
        is_primary,
        batch_shipments!inner(status)
      `)
      .eq('shopper_id', shopperId)
    if (schedulesError) throw schedulesError

    const ordersCompleted = (schedules ?? []).filter((s: any) =>
      s.batch_shipments?.status === 'closed' || s.batch_shipments?.status === 'shipping'
    ).length

    // Get active schedules (future shipments)
    const { data: activeSchedules, error: activeError } = await supabase
      .from('batch_shopper_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('shopper_id', shopperId)
    if (activeError) throw activeError

    return {
      ordersCompleted,
      totalRating: Math.round(totalRating * 10) / 10,
      reviewsCount,
      activeSchedules: activeSchedules?.length ?? 0,
    }
  },

  /**
   * Get all fee settings
   */
  async getFeeSettings(): Promise<FeeSetting[]> {
    const { data, error } = await supabase
      .from('fee_settings')
      .select('*')
      .order('key', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  /**
   * Update a fee setting by key
   */
  async updateFeeSetting(key: string, value: string): Promise<FeeSetting | null> {
    const { data, error } = await supabase
      .from('fee_settings')
      .update({ value })
      .eq('key', key)
      .select()
      .maybeSingle()
    if (error) throw error
    return data
  },

  /**
   * Get schedules for a shopper with full batch shipment details
   */
  async getSchedules(shopperId: string): Promise<ShopperScheduleWithShipment[]> {
    const { data, error } = await supabase
      .from('batch_shopper_schedules')
      .select(`
        is_primary,
        batch_shipments!inner(*)
      `)
      .eq('shopper_id', shopperId)
      .order('batch_shipments.departure_date', { ascending: true })
    if (error) throw error
    return (data ?? []).map((s: any) => ({
      is_primary: s.is_primary,
      batch_shipment: s.batch_shipments,
    }))
  },

  /**
   * Create a new shopper schedule
   */
  async createSchedule(data: ShopperScheduleCreateInput): Promise<BatchShopperSchedule | null> {
    const { data: result, error } = await supabase
      .from('batch_shopper_schedules')
      .insert({
        batch_id: data.batch_id,
        shopper_id: data.shopper_id,
        is_primary: data.is_primary ?? false,
      })
      .select()
      .maybeSingle()
    if (error) throw error
    return result
  },
}
