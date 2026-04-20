import { supabase } from '@/lib/supabase'
import type { Address } from '@/types/database.types'

export const addressesService = {
  async list(): Promise<Address[]> {
    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .order('is_primary', { ascending: false })
    if (error) throw error
    return data
  },

  async get(id: string): Promise<Address> {
    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async create(payload: Omit<Address, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Address> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('addresses')
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, payload: Partial<Omit<Address, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<Address> {
    const { data, error } = await supabase
      .from('addresses')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('addresses')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async setPrimary(id: string): Promise<Address> {
    // The DB trigger handles unsetting other primaries
    const { data, error } = await supabase
      .from('addresses')
      .update({ is_primary: true })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
