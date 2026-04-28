import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react'

export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Mohon masukkan email')
      return
    }

    setLoading(true)
    const result = await resetPassword(email)
    setLoading(false)

    if (result.success) {
      setSent(true)
    } else {
      setError(result.error || 'Gagal mengirim email reset password')
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-orange-50/10 to-background p-4">
        <Card className="w-full max-w-md shadow-xl border-border/60">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-xl">Email Terkirim!</CardTitle>
              <CardDescription className="mt-2">
                Link reset password telah dikirim ke <strong>{email}</strong>.
                Silakan cek inbox dan folder spam.
              </CardDescription>
            </div>
          </CardHeader>
          <CardFooter className="flex justify-center border-t pt-6">
            <Button onClick={() => setSent(false)} variant="outline" size="sm">
              Kirim ulang
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-orange-50/10 to-background p-4">
      <Link to="/auth/login" className="mb-8 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">Kembali ke login</span>
      </Link>

      <Card className="w-full max-w-md shadow-xl border-border/60">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Lupa Password</CardTitle>
            <CardDescription>
              Masukkan email yang terdaftar untuk menerima link reset
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Mengirim...' : 'Kirim Link Reset'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
