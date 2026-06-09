import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { 
  Loader2, Save, User, Mail, Shield, Star, Clock, 
  Coins, LogOut, ArrowLeft, KeyRound, Eye, EyeOff,
  LayoutDashboard, ShoppingBag
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  customer: 'Pelanggan',
  ops_admin: 'Admin Operasional',
  support: 'Support',
  finance: 'Keuangan',
  affiliate: 'Afiliasi',
  super_admin: 'Super Admin',
}

const TIER_LABELS: Record<string, string> = {
  Free: 'Gratis',
  Plus: 'Plus',
  Pro: 'Pro',
  Seller: 'Seller',
}

const TIER_COLORS: Record<string, string> = {
  Free: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  Plus: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Pro: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Seller: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

export default function Profile() {
  const { profile, user, signOut, updateProfile, changePassword, loading: authLoading, getDashboardRoute } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState(profile?.name || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Password change
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const initials = (profile.name || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleSaveProfile = async () => {
    setSaveError('')
    setSaveSuccess(false)

    if (!name.trim()) {
      setSaveError('Nama tidak boleh kosong')
      return
    }

    setSaving(true)
    const result = await updateProfile({ name: name.trim() })
    setSaving(false)

    if (result.success) {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } else {
      setSaveError(result.error || 'Gagal menyimpan profil')
    }
  }

  const handleChangePassword = async () => {
    setPasswordError('')
    setPasswordSuccess(false)

    if (!newPassword) {
      setPasswordError('Password baru tidak boleh kosong')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('Password minimal 6 karakter')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Password dan konfirmasi tidak cocok')
      return
    }

    setChangingPassword(true)
    const result = await changePassword(newPassword)
    setChangingPassword(false)

    if (result.success) {
      setPasswordSuccess(true)
      setNewPassword('')
      setConfirmNewPassword('')
      setTimeout(() => setPasswordSuccess(false), 3000)
    } else {
      setPasswordError(result.error || 'Gagal mengubah password')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-orange-50/10 to-background">
      {/* Header */}
      <header className="sticky top-0 z-30 h-16 flex items-center gap-4 border-b border-border/60 bg-background/80 backdrop-blur px-4 md:px-6">
        <Link to={getDashboardRoute()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          <span className="font-semibold text-lg">MyBagasi</span>
        </div>
        <div className="flex-1" />
        <Link to={getDashboardRoute()}>
          <Button variant="ghost" size="sm">
            <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate('/'); }}>
          <LogOut className="mr-2 h-4 w-4" /> Keluar
        </Button>
      </header>

      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        {/* Profile Header */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 text-lg bg-gradient-coral text-primary-foreground">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h1 className="text-xl font-bold">{profile.name || 'User'}</h1>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className={TIER_COLORS[profile.tier] || ''}>
                    <Star className="mr-1 h-3 w-3" /> {TIER_LABELS[profile.tier] || profile.tier}
                  </Badge>
                  <Badge variant="outline">
                    <Shield className="mr-1 h-3 w-3" /> {ROLE_LABELS[profile.role] || profile.role}
                  </Badge>
                  <Badge variant="outline">
                    <Coins className="mr-1 h-3 w-3" /> {profile.points_balance?.toLocaleString() || 0} poin
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Edit Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" /> Informasi Profil
            </CardTitle>
            <CardDescription>Perbarui nama dan informasi akun kamu</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            {saveSuccess && (
              <Alert>
                <AlertDescription className="text-green-600 dark:text-green-400">
                  ✅ Profil berhasil diperbarui
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Nama Lengkap</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama kamu"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email
              </Label>
              <Input value={profile.email || user?.email || ''} disabled className="opacity-60" />
              <p className="text-xs text-muted-foreground">
                Email tidak dapat diubah secara langsung. Hubungi support untuk perubahan email.
              </p>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Ganti Password
            </CardTitle>
            <CardDescription>Gunakan minimal 6 karakter</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
            {passwordSuccess && (
              <Alert>
                <AlertDescription className="text-green-600 dark:text-green-400">
                  ✅ Password berhasil diubah
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="newPassword">Password Baru</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimal 6 karakter"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmNewPassword">Konfirmasi Password Baru</Label>
              <Input
                id="confirmNewPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Ulangi password baru"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </div>

            <Button 
              onClick={handleChangePassword} 
              disabled={changingPassword}
              variant="outline"
            >
              {changingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              {changingPassword ? 'Mengubah...' : 'Ganti Password'}
            </Button>
          </CardContent>
        </Card>

        {/* Telegram Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-blue-500" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.127.087.498.082.607-.096 1.392-.613 5.039-.866 6.673-.107.69-.32 1.023-.525 1.122-.446.217-1.109-.156-2.067-1.011l-.017.012c-.588-.443-2.044-1.67-2.149-1.78-.168-.18-.262-.308-.02-.565l3.452-3.39c.156-.156.227-.363-.012-.553-.14-.11-.28-.054-.413-.014l-.04.013-5.57 3.562c-.452.24-.76.17-.962-.083-.215-.266-.72-.935-.88-1.274-.24-.497-.34-.952.262-1.178.338-.129 3.554-1.508 5.49-2.257 1.425-.553 2.384-.84 2.818-.87z"/>
              </svg>
              Hubungkan Telegram
            </CardTitle>
            <CardDescription>
              Hubungkan akun MyBagasi kamu ke Telegram untuk notifikasi & kemudahan akses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.telegram_id ? (
              <>
                <Alert>
                  <AlertDescription className="text-green-600 dark:text-green-400 flex items-center gap-2">
                    ✅ Terhubung ke Telegram
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-blue-500" fill="currentColor">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.127.087.498.082.607-.096 1.392-.613 5.039-.866 6.673-.107.69-.32 1.023-.525 1.122-.446.217-1.109-.156-2.067-1.011l-.017.012c-.588-.443-2.044-1.67-2.149-1.78-.168-.18-.262-.308-.02-.565l3.452-3.39c.156-.156.227-.363-.012-.553-.14-.11-.28-.054-.413-.014l-.04.013-5.57 3.562c-.452.24-.76.17-.962-.083-.215-.266-.72-.935-.88-1.274-.24-.497-.34-.952.262-1.178.338-.129 3.554-1.508 5.49-2.257 1.425-.553 2.384-.84 2.818-.87z"/>
                    </svg>
                    Status
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Akun Telegram kamu sudah terhubung ke MyBagasi.
                    Kamu bisa menggunakan bot untuk cek status pesanan dan lainnya.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Alert>
                  <AlertDescription className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    ⚠️ Belum terhubung ke Telegram
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label>Kode Unik Kamu</Label>
                  <div className="flex items-center gap-2">
                    <code className="relative rounded bg-muted px-4 py-2.5 font-mono text-sm font-bold tracking-widest select-all border">
                      {profile.telegram_token || '-'}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (profile.telegram_token) {
                          navigator.clipboard.writeText(profile.telegram_token)
                        }
                      }}
                    >
                      Salin
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-medium">📋 Cara menghubungkan:</p>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>
                      Buka Telegram dan buka <a href="https://t.me/mybagasibot" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-medium">@mybagasibot</a>
                    </li>
                    <li>
                      Kirim pesan: <code className="text-xs">/start {profile.telegram_token || 'KODE_ANDA'}</code>
                    </li>
                    <li>
                      Bot akan mengkonfirmasi akun kamu terhubung ✅
                    </li>
                  </ol>
                  <p className="text-xs text-muted-foreground mt-2">
                    Link langsung: <a href="https://t.me/mybagasibot" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">https://t.me/mybagasibot</a>
                  </p>
                  <p className="text-xs text-destructive mt-1">
                    ⚠️ Jangan bagikan kode ini ke siapapun!
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => window.open('https://t.me/mybagasibot', '_blank')}
                    className="flex items-center gap-2"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.127.087.498.082.607-.096 1.392-.613 5.039-.866 6.673-.107.69-.32 1.023-.525 1.122-.446.217-1.109-.156-2.067-1.011l-.017.012c-.588-.443-2.044-1.67-2.149-1.78-.168-.18-.262-.308-.02-.565l3.452-3.39c.156-.156.227-.363-.012-.553-.14-.11-.28-.054-.413-.014l-.04.013-5.57 3.562c-.452.24-.76.17-.962-.083-.215-.266-.72-.935-.88-1.274-.24-.497-.34-.952.262-1.178.338-.129 3.554-1.508 5.49-2.257 1.425-.553 2.384-.84 2.818-.87z"/>
                    </svg>
                    Buka @mybagasibot
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" /> Info Akun
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={profile.status === 'active' ? 'default' : 'destructive'}>
                {profile.status === 'active' ? 'Aktif' : 'Ditangguhkan'}
              </Badge>
            </div>
            <Separator />
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Terdaftar sejak</span>
              <span className="text-sm font-medium">
                {new Date(profile.created_at).toLocaleDateString('id-ID', {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Terakhir diperbarui</span>
              <span className="text-sm font-medium">
                {new Date(profile.updated_at).toLocaleDateString('id-ID', {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Poin</span>
              <span className="text-sm font-medium">{profile.points_balance?.toLocaleString() || 0}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Role</span>
              <span className="text-sm font-medium">{ROLE_LABELS[profile.role] || profile.role}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
