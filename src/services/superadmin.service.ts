import { supabase } from '@/lib/supabase'
import type {
  Marketplace, PricingRule, FeeSetting, ShippingRoute,
  AffiliateCommissionTier, AffiliatePayout, AffiliatePayoutStatus,
  AiSetting,
} from '@/types/database.types'

// ─── Marketplaces ─────────────────────────────────────────────
export const marketplacesService = {
  async list() {
    const { data, error } = await supabase
      .from('marketplaces')
      .select('*')
      .order('name')
    if (error) throw error
    return data
  },

  async update(id: string, updates: Partial<Marketplace>): Promise<Marketplace> {
    const { data, error } = await supabase
      .from('marketplaces')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async toggle(id: string, active: boolean): Promise<Marketplace> {
    return marketplacesService.update(id, { active })
  },
}

// ─── Pricing Rules ────────────────────────────────────────────
export const pricingRulesService = {
  async list() {
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .order('name')
    if (error) throw error
    return data
  },

  async create(payload: Omit<PricingRule, 'id' | 'created_at' | 'updated_at'>): Promise<PricingRule> {
    const { data, error } = await supabase
      .from('pricing_rules')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, updates: Partial<PricingRule>): Promise<PricingRule> {
    const { data, error } = await supabase
      .from('pricing_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('pricing_rules').delete().eq('id', id)
    if (error) throw error
  },
}

// ─── Fee Settings ─────────────────────────────────────────────
export const feeSettingsService = {
  async getAll(): Promise<Record<string, string>> {
    const { data, error } = await supabase
      .from('fee_settings')
      .select('key, value')
    if (error) throw error
    return Object.fromEntries(data.map(({ key, value }) => [key, value]))
  },

  async update(key: string, value: string): Promise<FeeSetting> {
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('fee_settings')
      .update({ value, updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async get(key: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('fee_settings')
      .select('value')
      .eq('key', key)
      .single()
    if (error) return null
    return data.value
  },
}

// ─── Shipping Routes ──────────────────────────────────────────
export const shippingRoutesService = {
  async list() {
    const { data, error } = await supabase
      .from('shipping_routes')
      .select('*')
      .order('price_per_kg')
    if (error) throw error
    return data
  },

  async create(payload: Omit<ShippingRoute, 'id' | 'created_at' | 'updated_at'>): Promise<ShippingRoute> {
    const { data, error } = await supabase
      .from('shipping_routes')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, updates: Partial<ShippingRoute>): Promise<ShippingRoute> {
    const { data, error } = await supabase
      .from('shipping_routes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async toggle(id: string, active: boolean): Promise<ShippingRoute> {
    return shippingRoutesService.update(id, { active })
  },
}

// ─── Affiliate ────────────────────────────────────────────────
export const affiliateService = {
  async getTiers(): Promise<AffiliateCommissionTier[]> {
    const { data, error } = await supabase
      .from('affiliate_commission_tiers')
      .select('*')
      .order('min_orders')
    if (error) throw error
    return data
  },

  async updateTier(id: string, updates: Partial<AffiliateCommissionTier>): Promise<AffiliateCommissionTier> {
    const { data, error } = await supabase
      .from('affiliate_commission_tiers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async listPayouts(status?: AffiliatePayoutStatus) {
    let query = supabase
      .from('affiliate_payouts')
      .select('*, profiles(name, email)')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async approvePayout(id: string): Promise<AffiliatePayout> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('affiliate_payouts')
      .update({ status: 'approved', approved_by: user.id })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async markPaid(id: string): Promise<AffiliatePayout> {
    const { data, error } = await supabase
      .from('affiliate_payouts')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// ─── AI Settings ──────────────────────────────────────────────
export const aiSettingsService = {
  async getAll(): Promise<Record<string, string>> {
    const { data, error } = await supabase
      .from('ai_settings')
      .select('key, value')
    if (error) throw error
    return Object.fromEntries(data.map(({ key, value }) => [key, value]))
  },

  async update(key: string, value: string): Promise<AiSetting> {
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('ai_settings')
      .update({ value, updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// ─── Super Admin Dashboard Stats ──────────────────────────────
export const superAdminStatsService = {
  async get() {
    const [users, members, affiliates, marketplaces] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact' }),
      supabase.from('user_memberships').select('id', { count: 'exact' }).neq('tier', 'Free'),
      supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'affiliate'),
      supabase.from('marketplaces').select('id', { count: 'exact' }).eq('active', true),
    ])

    return {
      totalUsers: users.count ?? 0,
      activeMembers: members.count ?? 0,
      affiliates: affiliates.count ?? 0,
      marketplacesActive: marketplaces.count ?? 0,
    }
  },
}
