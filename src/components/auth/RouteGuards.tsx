import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types/database.types'

interface ProtectedRouteProps {
  children: React.ReactNode
  roles?: UserRole[]
}

/**
 * Protects routes from unauthenticated users.
 * If roles are specified, also checks user has at least one of the roles.
 */
export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Memuat...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={`/${profile.username}/dashboard`} replace />
  }

  return <>{children}</>
}

/**
 * Redirects authenticated users away from guest pages (login/register)
 */
export function GuestRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (profile) {
    return <Navigate to={`/${profile.username}/dashboard`} replace />
  }

  return <>{children}</>
}
