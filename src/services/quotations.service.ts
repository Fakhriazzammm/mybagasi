import { supabase } from '@/lib/supabase'
import type { Quotation, QuotationStatus } from '@/types/database.types'

export const quotationsService = {
  async list(status?: QuotationStatus) {
    let query = supabase
      .from('quotations')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async get(id: string): Promise<Quotation> {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async create(payload: {
    product: string
    url?: string
    source?: string
    price_jpy?: number
    exchange_rate?: number
    service_fee: number
    shipping_cost: number
    tax_customs: number
    membership_discount?: number
    points_used?: number
    total: number
  }): Promise<Quotation> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('quotations')
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async markConverted(id: string) {
    const { data, error } = await supabase
      .from('quotations')
      .update({ status: 'converted' })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Staff: list all quotations
  async listAll(status?: QuotationStatus) {
    let query = supabase
      .from('quotations')
      .select('*, profiles(name, email)')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  // Expire old quotations (called server-side or via edge function)
  async expireOld() {
    const { data, error } = await supabase
      .from('quotations')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString())
      .select()
    if (error) throw error
    return data
  },
}
