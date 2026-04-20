import { supabase } from '@/lib/supabase'
import type {
  ProcurementQueue, ProcurementStatus, PriorityLevel,
  SupportNote, SupportStatus,
  TrackingException, ScraperFailure, QuoteApproval,
} from '@/types/database.types'

// ─── Procurement ────────────────────────────────────────────
export const procurementService = {
  async list(status?: ProcurementStatus) {
    let query = supabase
      .from('procurement_queue')
      .select(`
        *,
        profiles(name),
        orders(product, source)
      `)
      .order('created_at', { ascending: true })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async updateStatus(id: string, status: ProcurementStatus): Promise<ProcurementQueue> {
    const { data, error } = await supabase
      .from('procurement_queue')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async assign(id: string, assignedTo: string): Promise<ProcurementQueue> {
    const { data, error } = await supabase
      .from('procurement_queue')
      .update({ assigned_to: assignedTo })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updatePriority(id: string, priority: PriorityLevel): Promise<ProcurementQueue> {
    const { data, error } = await supabase
      .from('procurement_queue')
      .update({ priority })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async create(payload: Omit<ProcurementQueue, 'id' | 'created_at' | 'updated_at'>): Promise<ProcurementQueue> {
    const { data, error } = await supabase
      .from('procurement_queue')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// ─── Support Notes ───────────────────────────────────────────
export const supportService = {
  async list(status?: SupportStatus) {
    let query = supabase
      .from('support_notes')
      .select(`
        *,
        customer:profiles!support_notes_user_id_fkey(name),
        agent:profiles!support_notes_agent_id_fkey(name),
        orders(id)
      `)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async create(payload: Pick<SupportNote, 'user_id' | 'order_id' | 'channel' | 'note'>): Promise<SupportNote> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('support_notes')
      .insert({ ...payload, agent_id: user.id, status: 'open' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateStatus(id: string, status: SupportStatus): Promise<SupportNote> {
    const { data, error } = await supabase
      .from('support_notes')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// ─── Tracking Exceptions ─────────────────────────────────────
export const trackingExceptionsService = {
  async list(resolved = false) {
    let query = supabase
      .from('tracking_exceptions')
      .select(`
        *,
        profiles(name),
        orders(id, product, tracking_number)
      `)
      .order('created_at', { ascending: false })

    if (!resolved) query = query.is('resolved_at', null)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async resolve(id: string): Promise<TrackingException> {
    const { data, error } = await supabase
      .from('tracking_exceptions')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async create(payload: Omit<TrackingException, 'id' | 'resolved_at' | 'created_at'>): Promise<TrackingException> {
    const { data, error } = await supabase
      .from('tracking_exceptions')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// ─── Scraper Failures ─────────────────────────────────────────
export const scraperService = {
  async list(resolved = false) {
    let query = supabase
      .from('scraper_failures')
      .select('*, marketplaces(name)')
      .order('created_at', { ascending: false })

    if (!resolved) query = query.is('resolved_at', null)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async resolve(id: string): Promise<ScraperFailure> {
    const { data, error } = await supabase
      .from('scraper_failures')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async incrementRetry(id: string): Promise<ScraperFailure> {
    const { data: current } = await supabase
      .from('scraper_failures')
      .select('retries')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('scraper_failures')
      .update({ retries: (current?.retries ?? 0) + 1 })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// ─── Quote Approvals ─────────────────────────────────────────
export const quoteApprovalsService = {
  async list() {
    const { data, error } = await supabase
      .from('quote_approvals')
      .select(`
        *,
        profiles(name),
        quotations(product, total)
      `)
      .is('approved', null)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data
  },

  async review(id: string, approved: boolean): Promise<QuoteApproval> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('quote_approvals')
      .update({
        approved,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// ─── Admin Dashboard Stats ────────────────────────────────────
export const adminStatsService = {
  async get() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [
      quotations, orders, payments,
      procurement, exceptions, scrapers,
      approvals, support,
    ] = await Promise.all([
      supabase.from('quotations').select('id', { count: 'exact' }).gte('created_at', today.toISOString()),
      supabase.from('orders').select('id, total', { count: 'exact' }).gte('created_at', today.toISOString()),
      supabase.from('payments').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('procurement_queue').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('tracking_exceptions').select('id', { count: 'exact' }).is('resolved_at', null),
      supabase.from('scraper_failures').select('id', { count: 'exact' }).is('resolved_at', null),
      supabase.from('quote_approvals').select('id', { count: 'exact' }).is('approved', null),
      supabase.from('support_notes').select('id', { count: 'exact' }).eq('status', 'open'),
    ])

    return {
      quotationsToday: quotations.count ?? 0,
      ordersToday: orders.count ?? 0,
      gmvToday: (orders.data ?? []).reduce((s, o) => s + o.total, 0),
      paymentsPending: payments.count ?? 0,
      procurementPending: procurement.count ?? 0,
      trackingExceptions: exceptions.count ?? 0,
      scraperFailures: scrapers.count ?? 0,
      approvalsQueue: approvals.count ?? 0,
      supportOpen: support.count ?? 0,
    }
  },
}
