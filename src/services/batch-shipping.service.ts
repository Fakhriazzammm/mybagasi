import { supabase } from '@/lib/supabase'
import type { BatchShipment, BatchParticipant, BatchStatus, BatchShipmentWithShoppers } from '@/types/database.types'

export const batchShippingService = {
  async list(status?: BatchStatus) {
    let query = supabase
      .from('batch_shipments')
      .select(`
        *,
        participants:batch_participants(count)
      `)
      .order('closes_at', { ascending: true })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async get(id: string) {
    const { data, error } = await supabase
      .from('batch_shipments')
      .select(`
        *,
        participants:batch_participants(
          id, user_id, items, weight_kg, joined_at,
          profiles(name)
        )
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async join(params: {
    batch_id: string
    order_id?: string
    items: number
    weight_kg: number
  }): Promise<BatchParticipant> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('batch_participants')
      .insert({
        batch_id: params.batch_id,
        user_id: user.id,
        order_id: params.order_id ?? null,
        items: params.items,
        weight_kg: params.weight_kg,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async leave(batchId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('batch_participants')
      .delete()
      .eq('batch_id', batchId)
      .eq('user_id', user.id)
    if (error) throw error
  },

  async listWithShoppers(): Promise<BatchShipmentWithShoppers[]> {
    const { data, error } = await supabase
      .from('batch_shipments')
      .select(`
        *,
        participants:batch_participants(count),
        shopper_schedules:batch_shopper_schedules(
          shopper_id,
          is_primary,
          personal_shoppers(id, name, slug, avatar_url, tagline, verification)
        )
      `)
      .order('departure_date', { ascending: true })
    if (error) throw error
    return (data ?? []).map((b: any) => ({
      ...b,
      shoppers: (b.shopper_schedules ?? [])
        .map((s: any) => s.personal_shoppers)
        .filter(Boolean)
    }))
  },

  async listByShopper(shopperSlug: string): Promise<BatchShipmentWithShoppers[]> {
    const { data, error } = await supabase
      .from('batch_shopper_schedules')
      .select(`
        batch_id,
        is_primary,
        batch_shipments!inner(
          *,
          participants:batch_participants(count)
        ),
        personal_shoppers!inner(id, name, slug, avatar_url, tagline, verification)
      `)
      .eq('personal_shoppers.slug', shopperSlug)
      .order('batch_shipments.departure_date', { ascending: true, nullsFirst: false })
    if (error) throw error
    return (data ?? []).map((s: any) => ({
      ...s.batch_shipments,
      is_primary: s.is_primary,
      shoppers: [s.personal_shoppers]
    }))
  },

  async getUserBatches(): Promise<BatchParticipant[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('batch_participants')
      .select('*, batch_shipments(*)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
    if (error) throw error
    return data
  },

  // ─── Admin CRUD ──────────────────────────────────────────

  async listAll(): Promise<BatchShipment[]> {
    const { data, error } = await supabase
      .from('batch_shipments')
      .select('*, participants:batch_participants(count)')
      .order('departure_date', { ascending: true })
    if (error) throw error
    return data
  },

  async create(payload: Omit<BatchShipment, 'id' | 'created_at' | 'updated_at'>): Promise<BatchShipment> {
    const { data, error } = await supabase
      .from('batch_shipments')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, updates: Partial<BatchShipment>): Promise<BatchShipment> {
    const { data, error } = await supabase
      .from('batch_shipments')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('batch_shipments')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async updateStatus(id: string, status: BatchStatus): Promise<BatchShipment> {
    const { data, error } = await supabase
      .from('batch_shipments')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
