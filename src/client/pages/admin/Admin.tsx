import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, CalendarDays, Clock3, LayoutDashboard, LogOut, Menu, Scissors, Settings2, Umbrella, Users, X } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router'
import { loginSchema } from '../../../shared/schemas.ts'
import type { AdminUser } from '../../../shared/types.ts'
import { Brand, Failure, Loading, useToast } from '../../components/ui.tsx'
import { api, errorText, RequestError } from '../../lib/api.ts'
import { useSettings } from '../public/public-data.ts'
import { AdminContext } from './admin-data.ts'
import Dashboard from './Dashboard.tsx'
import Bookings from './Bookings.tsx'
import { CatalogPage, SettingsPage } from './Catalog.tsx'
import Schedules from './Schedules.tsx'

const links = [
  ['dashboard', 'Dashboard', LayoutDashboard], ['reservasi', 'Reservasi', CalendarCheck],
  ['layanan', 'Layanan', Scissors], ['capster', 'Capster', Users], ['shift', 'Shift Kerja', Clock3],
  ['jadwal', 'Jadwal Capster', CalendarDays], ['hari-libur', 'Hari Libur', Umbrella], ['pengaturan', 'Pengaturan', Settings2],
] as const
const authKey = ['auth', 'me'] as const

export default function Admin() {
  const session = useQuery({ queryKey: authKey, queryFn: ({ signal }) => api<AdminUser>('/auth/me', { signal }),
    refetchInterval: 60_000, staleTime: 0 })
  if (session.isPending) return <main className="shell centered"><Loading /></main>
  if (session.isError && !(session.error instanceof RequestError && session.error.status === 401)) return <main className="shell centered">
    <Failure error={session.error} retry={() => void session.refetch()} /><Link to="/">Kembali ke beranda</Link>
  </main>
  return <Routes>
    <Route path="login" element={session.data ? <Navigate to="/admin/dashboard" replace /> : <Login />} />
    <Route path="*" element={session.data ? <AdminContext.Provider value={session.data}><AdminShell user={session.data} /></AdminContext.Provider> : <Navigate to="/admin/login" replace />} />
  </Routes>
}

function Login() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const cache = useQueryClient()
  const navigate = useNavigate()
  const { data: config } = useSettings()
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = loginSchema.safeParse(Object.fromEntries(form))
    if (!values.success) { setError('Masukkan username atau email dan kata sandi.'); return }
    setPending(true); setError('')
    try {
      const user = await api<AdminUser>('/auth/login', { method: 'POST', body: values.data })
      cache.removeQueries({ queryKey: ['admin'] })
      cache.setQueryData(authKey, user)
      navigate('/admin/dashboard', { replace: true })
    } catch (e) { setError(errorText(e)) }
    finally { setPending(false) }
  }
  return <main className="login-page"><div className="login-card">
    <Link to="/"><Brand settings={config} /></Link>
    <div><h1>Masuk sebagai admin</h1><p className="muted">Kelola reservasi dan jadwal capster.</p></div>
    {error && <p className="message danger" role="alert">{error}</p>}
    <form className="fields" onSubmit={(e) => void login(e)}>
      <label className="field">Username atau email<input name="identifier" required autoComplete="username" maxLength={254} /></label>
      <label className="field">Kata sandi<input name="password" type="password" required autoComplete="current-password" maxLength={256} /></label>
      <button className="button gold" disabled={pending}>{pending ? 'Memeriksa…' : 'Masuk'}</button>
    </form>
    <Link className="text-button" to="/">Kembali ke beranda</Link>
  </div></main>
}

function AdminShell({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const navigate = useNavigate()
  const cache = useQueryClient()
  const toast = useToast()
  const { data: config } = useSettings()
  async function logout() {
    setPending(true)
    try {
      await api('/auth/logout', { method: 'POST', csrf: user.csrf })
      cache.removeQueries({ queryKey: ['admin'] })
      cache.setQueryData(authKey, null)
      navigate('/admin/login', { replace: true })
      toast('Anda telah keluar.')
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) {
        cache.removeQueries({ queryKey: ['admin'] })
        cache.setQueryData(authKey, null)
        navigate('/admin/login', { replace: true })
      } else toast(errorText(error), 'error')
    } finally { setPending(false) }
  }
  return <div className="admin-layout">
    <header className="admin-top">
      <button className="icon-button mobile-menu" aria-label={open ? 'Tutup menu' : 'Buka menu'} aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen(!open)}>
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>
      <span className="admin-top-brand"><Brand settings={config} /></span>
      <span className="admin-top-title">Panel admin</span>
      <Link to="/" className="button outline">Lihat Website</Link>
    </header>
    <aside className={'admin-sidebar ' + (open ? 'open' : '')} id="admin-sidebar">
      <Link to="/admin/dashboard" className="side-brand" onClick={() => setOpen(false)}><Brand settings={config} /></Link>
      <nav aria-label="Navigasi admin">{links.map(([path, title, Icon]) => <NavLink key={path} to={'/admin/' + path} onClick={() => setOpen(false)}>
        <Icon size={19} /> {title}
      </NavLink>)}</nav>
      <div className="sidebar-footer"><span>{user.username}</span><button className="button outline" disabled={pending} onClick={() => void logout()}><LogOut size={16} /> Keluar</button></div>
    </aside>
    <main className="admin-main" id="admin-content"><Routes>
      <Route index element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="reservasi" element={<Bookings />} />
      <Route path="layanan" element={<CatalogPage key="services" kind="services" />} />
      <Route path="capster" element={<CatalogPage key="barbers" kind="barbers" />} />
      <Route path="shift" element={<CatalogPage key="shifts" kind="shifts" />} />
      <Route path="jadwal" element={<Schedules key="calendar" />} />
      <Route path="hari-libur" element={<Schedules key="off" daysOff />} />
      <Route path="pengaturan" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes></main>
  </div>
}
