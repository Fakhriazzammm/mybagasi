import { Navigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface UserRouteProps {
  children: React.ReactNode
}

/**
 * Verifies that the :username param in the URL matches the logged-in user's username.
 * Redirects unauthenticated users to /auth/login.
 * Redirects mismatched usernames to the same route path under the correct username.
 */
export function UserRoute({ children }: UserRouteProps) {
  const { profile, loading } = useAuth()
  const { username } = useParams<{ username: string }>()
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

  if (username !== profile.username) {
    // Extract the route part after the username segment
    // e.g. "/someuser/dashboard/settings" -> "/dashboard/settings"
    const restPath = location.pathname.replace(/^\/[^\/]+/, '')
    return <Navigate to={`/${profile.username}${restPath}`} replace />
  }

  return <>{children}</>
}
