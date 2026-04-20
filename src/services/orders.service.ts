import { supabase } from '@/lib/supabase'
import type { Order, OrderStatus, OrderTracking, OrderWithTracking } from '@/types/database.types'

export const ordersService = {
  async list(status?: OrderStatus): Promise<Order[]> {
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async get(id: string): Promise<OrderWithTracking> {
    const { data, error } = await supabase
      .from('orders')
      .select('*, tracking:order_tracking(*)')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as OrderWithTracking
  },

  async create(payload: {
    quotation_id?: string
    address_id?: string
    product: string
    source?: string
    price_jpy?: number
    exchange_rate?: number
    service_fee: number
    shipping_cost: number
    tax_customs: number
    membership_discount?: number
    points_used?: number
    total: number
    notes?: string
  }): Promise<Order> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('orders')
      .insert({ ...payload, user_id: user.id, status: 'draft' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateStatus(id: string, status: OrderStatus, note?: string): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    // Add tracking entry
    await supabase.from('order_tracking').insert({
      order_id: id,
      status,
      note: note ?? null,
      is_done: true,
      is_current: true,
      occurred_at: new Date().toISOString(),
    })

    // Mark previous tracking entries as not current
    await supabase
      .from('order_tracking')
      .update({ is_current: false })
      .eq('order_id', id)
      .neq('status', status)

    return data
  },

  async getTracking(orderId: string): Promise<OrderTracking[]> {
    const { data, error } = await supabase
      .from('order_tracking')
      .select('*')
      .eq('order_id', orderId)
      .order('occurred_at', { ascending: true })
    if (error) throw error
    return data
  },

  async assignTrackingNumber(id: string, trackingNumber: string, shippingRoute: string) {
    const { data, error } = await supabase
      .from('orders')
      .update({ tracking_number: trackingNumber, shipping_route: shippingRoute })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async setEta(id: string, eta: string) {
    const { data, error } = await supabase
      .from('orders')
      .update({ eta })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Staff: list all orders with user info
  async listAll(status?: OrderStatus) {
    let query = supabase
      .from('orders')
      .select('*, profiles(name, email)')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  // Daily/monthly stats for dashboards
  async getStats() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('orders')
      .select('id, total, status, created_at')
      .gte('created_at', today.toISOString())

    if (error) throw error
    return {
      ordersToday: data.length,
      gmvToday: data.reduce((sum, o) => sum + o.total, 0),
    }
  },
}
