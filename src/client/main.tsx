import '@fontsource-variable/plus-jakarta-sans/wght.css'
import './styles.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes } from 'react-router'
import CustomerHome from './pages/public/CustomerHome.tsx'
import { Loading, Toasts } from './components/ui.tsx'
import { queryClient } from './lib/api.ts'

const Booking = lazy(() => import('./pages/public/Booking.tsx'))
const Success = lazy(() => import('./pages/public/Booking.tsx').then((mod) => ({ default: mod.BookingSuccess })))
const Admin = lazy(() => import('./pages/admin/Admin.tsx'))

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter><Toasts><Suspense fallback={<div className="shell centered"><Loading /></div>}><Routes>
      <Route path="/" element={<CustomerHome />} />
      <Route path="/booking" element={<Booking />} />
      <Route path="/booking/berhasil" element={<Success />} />
      <Route path="/admin/*" element={<Admin />} />
      <Route path="*" element={<main className="shell centered"><h1>Halaman tidak ditemukan</h1><Link className="button gold" to="/">Kembali ke beranda</Link></main>} />
    </Routes></Suspense></Toasts></BrowserRouter>
  </QueryClientProvider>,
)
