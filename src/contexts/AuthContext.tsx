import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/types/database.types'

interface AuthContextValue {
  profile: Profile | null
  user: { id: string; email: string } | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signUp: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>
  updateProfile: (updates: Partial<Pick<Profile, 'name' | 'avatar_url' | 'username'>>) => Promise<{ success: boolean; error?: string }>
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>
  refreshProfile: () => Promise<void>
  hasRole: (...roles: UserRole[]) => boolean
  getDashboardRoute: () => string
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (error) {
      console.error('Failed to fetch profile:', error)
      setProfile(null)
    } else {
      setProfile(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! })
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! })
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { success: false, error: error.message }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' }
    }
  }

  const signUp = async (email: string, password: string, name: string) => {
    try {
      // Generate username from name FIRST (before using it)
      const username = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { 
          data: { name },
          emailRedirectTo: `${window.location.origin}/${username}`,
        },
      })
      if (error) return { success: false, error: error.message }

      // Set username in profile
      if (data?.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ username })
          .eq('id', data.user.id)
        if (profileError) {
          console.error('Failed to set username:', profileError)
        }
      }

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Registration failed' }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setUser(null)
  }

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      })
      if (error) return { success: false, error: error.message }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Password reset failed' }
    }
  }

  const updateProfile = async (updates: Partial<Pick<Profile, 'name' | 'avatar_url' | 'username'>>) => {
    try {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
      if (error) return { success: false, error: error.message }
      // Refresh profile
      await fetchProfile(user.id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Update failed' }
    }
  }

  const changePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) return { success: false, error: error.message }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Password change failed' }
    }
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  const hasRole = (...roles: UserRole[]) => {
    if (!profile) return false
    return roles.includes(profile.role)
  }

  const getDashboardRoute = () => {
    if (!profile) return '/auth/login'
    switch (profile.role) {
      case 'super_admin': return '/super-admin'
      case 'ops_admin': case 'support': return '/admin'
      case 'finance': return '/finance'
      case 'affiliate': return `/${profile.username}`
      case 'personal_shopper': return '/shopper'
      default: return `/${profile.username}`
    }
  }

  return (
    <AuthContext.Provider value={{ 
      profile, user, loading, 
      signIn, signUp, signOut, 
      resetPassword, updateProfile, changePassword,
      refreshProfile, hasRole, getDashboardRoute 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
