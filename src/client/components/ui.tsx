import { AlertCircle, Check, Inbox, Scissors, UserRound, X } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Settings } from '../../shared/types.ts'
import { errorText } from '../lib/api.ts'

const ToastContext = createContext<(message: string, type?: 'ok' | 'error') => void>(() => undefined)
export function Toasts({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'error' } | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.type === 'error' ? 6500 : 4000)
    return () => clearTimeout(timer)
  }, [toast])
  return <ToastContext.Provider value={(message, type = 'ok') => setToast({ message, type })}>
    {children}
    {toast && <div className={'toast ' + toast.type} role={toast.type === 'error' ? 'alert' : 'status'}>
      {toast.type === 'ok' ? <Check size={19} /> : <AlertCircle size={19} />}
      <span>{toast.message}</span><button className="icon-button" aria-label="Tutup notifikasi" onClick={() => setToast(null)}><X size={18} /></button>
    </div>}
  </ToastContext.Provider>
}
export const useToast = () => useContext(ToastContext)
export function Brand({ settings, to, onNavigate }: {
  settings?: Pick<Settings, 'name' | 'logo_url'>; to?: string; onNavigate?: () => void
}) {
  const name = settings?.name ?? 'YRM Barber'
  const logo = <PhotoPreview src={settings?.logo_url ?? ''} title={'Foto profil ' + name} className="brand-icon"
    fallback={<Scissors size={19} strokeWidth={1.7} aria-hidden="true" />} />
  if (to && !settings?.logo_url) return <Link className="brand" to={to} onClick={onNavigate}>{logo}<span>{name}</span></Link>
  return <span className="brand">
    {logo}
    {to ? <Link to={to} onClick={onNavigate}>{name}</Link> : <span>{name}</span>}
  </span>
}
export function Avatar({ photo, name }: { photo: string; name: string }) {
  return <PhotoPreview src={photo} title={'Foto ' + name} className="avatar" loading="lazy"
    fallback={<UserRound size={27} aria-hidden="true" />} />
}

export function PhotoPreview({ src, title, className, fallback, loading }: {
  src: string; title: string; className: string; fallback?: ReactNode; loading?: 'lazy'
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [failedSrc, setFailedSrc] = useState('')
  const [openSrc, setOpenSrc] = useState('')
  const [failedPreview, setFailedPreview] = useState('')
  if (!src || src === failedSrc) return fallback && <span className={className}>{fallback}</span>

  function close() {
    setOpenSrc('')
    requestAnimationFrame(() => trigger.current?.focus())
  }

  return <>
    <button ref={trigger} type="button" className={className + ' photo-trigger'} aria-label={'Lihat ' + title}
      aria-haspopup="dialog" onClick={() => { setFailedPreview(''); setOpenSrc(src) }}>
      <img src={src} alt="" loading={loading} onError={() => setFailedSrc(src)} />
    </button>
    {openSrc === src && <Modal title={title} close={close} className="photo-dialog" dismissOnBackdrop>
      {failedPreview === src ? <p className="message danger" role="alert">Foto gagal dimuat.</p> :
        <img className="photo-full" src={src} alt={title} onError={() => setFailedPreview(src)} />}
    </Modal>}
  </>
}
export function Loading({ label = 'Memuat…' }: { label?: string }) {
  return <div className="skeleton-wrap" role="status" aria-label={label}><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty"><Inbox size={25} aria-hidden="true" /><p>{children}</p></div>
}
export function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div className="message danger" role="alert"><AlertCircle size={19} /><div>{errorText(error)} {retry && <button type="button" className="text-button" onClick={retry}>Coba lagi</button>}</div></div>
}
export function Modal({ title, close, children, className, dismissOnBackdrop = false }: {
  title: string; close: () => void; children: ReactNode; className?: string; dismissOnBackdrop?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog className={className ? 'dialog ' + className : 'dialog'} ref={ref} aria-label={title}
    onClick={dismissOnBackdrop ? (e) => { if (e.target === e.currentTarget) close() } : undefined}
    onCancel={(e) => { e.preventDefault(); close() }}>
    <div className="dialog-content">
      <header className="section-row"><h2>{title}</h2><button className="icon-button" type="button" onClick={close} aria-label="Tutup"><X size={21} /></button></header>
      {children}
    </div>
  </dialog>
}
