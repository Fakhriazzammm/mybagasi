import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/types/database.types'

export const authService = {
  async signUp(email: string, password: string, name: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) throw error
    return data
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },

  async getProfile(): Promise<Profile | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) throw error
    return data
  },

  async updateProfile(updates: Partial<Pick<Profile, 'name' | 'avatar_url'>>) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  onAuthStateChange(callback: (profile: Profile | null) => void) {
    return supabase.auth.onAuthStateChange(async (_, session) => {
      if (!session) return callback(null)
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      callback(data)
    })
  },
}

// Super admin only
export const userManagementService = {
  async listUsers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async updateUserRole(userId: string, role: UserRole) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async suspendUser(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ status: 'suspended' })
      .eq('id', userId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async activateUser(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ status: 'active' })
      .eq('id', userId)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
