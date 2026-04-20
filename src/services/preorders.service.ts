import { supabase } from '@/lib/supabase'
import type { Preorder, PreorderBooking } from '@/types/database.types'

export const preordersService = {
  async list(): Promise<Preorder[]> {
    const { data, error } = await supabase
      .from('preorders')
      .select('*')
      .eq('active', true)
      .order('closes_at', { ascending: true })
    if (error) throw error
    return data
  },

  async get(id: string): Promise<Preorder> {
    const { data, error } = await supabase
      .from('preorders')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async book(params: {
    preorder_id: string
    payment_type: 'dp' | 'full'
    amount_paid: number
    amount_remaining: number
  }): Promise<PreorderBooking> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Check quota
    const { data: preorder } = await supabase
      .from('preorders')
      .select('quota_total, quota_taken')
      .eq('id', params.preorder_id)
      .single()

    if (preorder && preorder.quota_taken >= preorder.quota_total) {
      throw new Error('Quota sudah penuh')
    }

    const { data, error } = await supabase
      .from('preorder_bookings')
      .insert({
        preorder_id: params.preorder_id,
        user_id: user.id,
        payment_type: params.payment_type,
        amount_paid: params.amount_paid,
        amount_remaining: params.amount_remaining,
        status: 'pending',
      })
      .select()
      .single()

    if (error) throw error

    // Increment quota_taken
    await supabase.rpc('increment_preorder_quota', { preorder_id: params.preorder_id })

    return data
  },

  async getUserBookings(): Promise<PreorderBooking[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('preorder_bookings')
      .select('*, preorders(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  // Super admin
  async create(payload: Omit<Preorder, 'id' | 'quota_taken' | 'created_at' | 'updated_at'>): Promise<Preorder> {
    const { data, error } = await supabase
      .from('preorders')
      .insert({ ...payload, quota_taken: 0 })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('preorders')
      .update({ active: false })
      .eq('id', id)
    if (error) throw error
  },
}
