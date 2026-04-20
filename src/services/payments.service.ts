import { supabase } from '@/lib/supabase'
import type { Payment, PaymentMethod, PaymentStatus, Refund, RefundStatus } from '@/types/database.types'

export const paymentsService = {
  async list(status?: PaymentStatus): Promise<Payment[]> {
    let query = supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async create(payload: {
    order_id: string
    method: PaymentMethod
    amount: number
  }): Promise<Payment> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('payments')
      .insert({ ...payload, user_id: user.id, status: 'pending' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async settle(id: string, gatewayRef?: string): Promise<Payment> {
    const { data, error } = await supabase
      .from('payments')
      .update({
        status: 'settled',
        gateway_ref: gatewayRef ?? null,
        settled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async fail(id: string): Promise<Payment> {
    const { data, error } = await supabase
      .from('payments')
      .update({ status: 'failed' })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Finance: list all payments with customer & order info
  async listAll(status?: PaymentStatus) {
    let query = supabase
      .from('payments')
      .select('*, profiles(name), orders(product)')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getStats() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    const [todayRes, pendingRes, mtdRes] = await Promise.all([
      supabase.from('payments').select('amount').eq('status', 'settled').gte('created_at', today.toISOString()),
      supabase.from('payments').select('amount, id').eq('status', 'pending'),
      supabase.from('payments').select('amount').eq('status', 'settled').gte('created_at', startOfMonth.toISOString()),
    ])

    return {
      paymentsToday: todayRes.data?.reduce((s, p) => s + p.amount, 0) ?? 0,
      pendingPayment: pendingRes.data?.reduce((s, p) => s + p.amount, 0) ?? 0,
      pendingCount: pendingRes.data?.length ?? 0,
      gmvMtd: mtdRes.data?.reduce((s, p) => s + p.amount, 0) ?? 0,
    }
  },
}

export const refundsService = {
  async list(status?: RefundStatus): Promise<Refund[]> {
    let query = supabase
      .from('refunds')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async create(payload: {
    order_id: string
    payment_id?: string
    amount: number
    reason: string
  }): Promise<Refund> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('refunds')
      .insert({ ...payload, user_id: user.id, status: 'pending_review' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateStatus(id: string, status: RefundStatus): Promise<Refund> {
    const updates: Partial<Refund> = { status }
    if (status === 'completed') updates.processed_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('refunds')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Finance: list all with details
  async listAll(status?: RefundStatus) {
    let query = supabase
      .from('refunds')
      .select('*, profiles(name), orders(product)')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },
}
