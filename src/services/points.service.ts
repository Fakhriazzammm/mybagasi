import { supabase } from '@/lib/supabase'
import type { PointsLedger, PointsType } from '@/types/database.types'

export const pointsService = {
  async getBalance(): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    const { data, error } = await supabase
      .from('profiles')
      .select('points_balance')
      .eq('id', user.id)
      .single()
    if (error) return 0
    return data.points_balance
  },

  async getLedger(userId?: string): Promise<PointsLedger[]> {
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id
    if (!uid) return []

    const { data, error } = await supabase
      .from('points_ledger')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async addPoints(params: {
    user_id: string
    type: PointsType
    amount: number
    order_id?: string
    reference?: string
    expires_at?: string
  }) {
    // Get current balance
    const { data: profile } = await supabase
      .from('profiles')
      .select('points_balance')
      .eq('id', params.user_id)
      .single()

    const currentBalance = profile?.points_balance ?? 0
    const newBalance =
      params.type === 'earn'
        ? currentBalance + params.amount
        : currentBalance - params.amount

    const { data, error } = await supabase
      .from('points_ledger')
      .insert({
        user_id: params.user_id,
        type: params.type,
        amount: params.amount,
        balance_after: Math.max(0, newBalance),
        order_id: params.order_id ?? null,
        reference: params.reference ?? null,
        expires_at: params.expires_at ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Calculate points earned for an order (based on membership tier)
  calculatePoints(amountIdr: number, multiplier: number): number {
    return Math.floor((amountIdr / 1000) * multiplier)
  },

  // Finance: all users ledger
  async listAll() {
    const { data, error } = await supabase
      .from('points_ledger')
      .select('*, profiles(name)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getLiability(): Promise<number> {
    const { data, error } = await supabase
      .from('profiles')
      .select('points_balance')
    if (error) return 0
    const totalPoints = data.reduce((s, p) => s + p.points_balance, 0)
    return totalPoints * 10 // 1 point = Rp 10
  },
}
