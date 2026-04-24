import { supabase } from '@/lib/supabase'
import type { Quotation, QuotationAiAudit, QuotationStatus } from '@/types/database.types'

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
    confidence_score?: number
    confidence_label?: string
    price_history?: Record<string, unknown>
    assistant_summary?: Record<string, unknown>
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

  async createWithAudit(
    quotationPayload: {
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
      confidence_score?: number
      confidence_label?: string
      price_history?: Record<string, unknown>
      assistant_summary?: Record<string, unknown>
    },
    auditPayload: {
      input_url?: string
      input_query?: string
      input_budget?: string
      confidence_score: number
      confidence_label: string
      confidence_reasons: string[]
      price_history: Record<string, unknown>
      similar_count: number
      estimation_payload: Record<string, unknown>
    },
  ): Promise<{ quotation: Quotation; audit: QuotationAiAudit | null }> {
    const quotation = await this.create(quotationPayload)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { quotation, audit: null }
    }

    const { data: audit, error: auditError } = await supabase
      .from('quotation_ai_audits')
      .insert({
        quotation_id: quotation.id,
        user_id: user.id,
        input_url: auditPayload.input_url ?? null,
        input_query: auditPayload.input_query ?? null,
        input_budget: auditPayload.input_budget ?? null,
        confidence_score: auditPayload.confidence_score,
        confidence_label: auditPayload.confidence_label,
        confidence_reasons: auditPayload.confidence_reasons,
        price_history: auditPayload.price_history,
        similar_count: auditPayload.similar_count,
        estimation_payload: auditPayload.estimation_payload,
      })
      .select()
      .single()

    if (auditError) {
      throw auditError
    }

    return { quotation, audit }
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
