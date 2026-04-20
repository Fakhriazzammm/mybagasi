import { supabase } from '@/lib/supabase'
import type { MembershipPlan, MembershipTier, UserMembership } from '@/types/database.types'

export const membershipService = {
  async getPlans(): Promise<MembershipPlan[]> {
    const { data, error } = await supabase
      .from('membership_plans')
      .select('*')
      .eq('active', true)
      .order('price_monthly', { ascending: true })
    if (error) throw error
    return data
  },

  async getUserMembership(userId?: string): Promise<UserMembership | null> {
    const query = supabase
      .from('user_memberships')
      .select('*, membership_plans(*)')

    if (userId) {
      const { data, error } = await query.eq('user_id', userId).single()
      if (error) return null
      return data
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await query.eq('user_id', user.id).single()
    if (error) return null
    return data
  },

  async upgradeTier(tier: MembershipTier) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const plan = await supabase
      .from('membership_plans')
      .select('id')
      .eq('name', tier)
      .single()

    if (plan.error) throw plan.error

    const renewsOn = new Date()
    renewsOn.setMonth(renewsOn.getMonth() + 1)

    const { data, error } = await supabase
      .from('user_memberships')
      .update({
        tier,
        plan_id: plan.data.id,
        renews_on: renewsOn.toISOString().split('T')[0],
      })
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    // Also update profile tier
    await supabase.from('profiles').update({ tier }).eq('id', user.id)

    return data
  },

  async addSpentAmount(userId: string, amount: number) {
    const { data: membership } = await supabase
      .from('user_memberships')
      .select('spent_amount, tier')
      .eq('user_id', userId)
      .single()

    if (!membership) return

    const newSpent = membership.spent_amount + amount

    await supabase
      .from('user_memberships')
      .update({ spent_amount: newSpent })
      .eq('user_id', userId)
  },

  // Super admin
  async updatePlan(id: string, updates: Partial<MembershipPlan>) {
    const { data, error } = await supabase
      .from('membership_plans')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getMembershipRevenue() {
    const { data, error } = await supabase
      .from('user_memberships')
      .select('tier, membership_plans(price_monthly)')
      .neq('tier', 'Free')

    if (error) throw error
    return data
  },
}
