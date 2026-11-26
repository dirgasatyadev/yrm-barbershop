import { AlertCircle, Check, Inbox, Scissors, UserRound, X } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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
export function Brand({ settings }: { settings?: Pick<Settings, 'name' | 'logo_url'> }) {
  return <span className="brand">
    <span className="brand-icon">{settings?.logo_url ? <img src={settings.logo_url} alt="" /> : <Scissors size={19} strokeWidth={1.7} />}</span>
    <span>{settings?.name ?? 'YRM Barber'}</span>
  </span>
}
export function Avatar({ photo, name }: { photo: string; name: string }) {
  const [failedPhoto, setFailedPhoto] = useState('')
  return <span className="avatar">{photo && failedPhoto !== photo ? <img src={photo} alt={name} loading="lazy" onError={() => setFailedPhoto(photo)} /> : <UserRound size={27} aria-hidden="true" />}</span>
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
export function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog className="dialog" ref={ref} aria-label={title} onCancel={(e) => { e.preventDefault(); close() }}>
    <div className="dialog-content">
      <header className="section-row"><h2>{title}</h2><button className="icon-button" type="button" onClick={close} aria-label="Tutup"><X size={21} /></button></header>
      {children}
    </div>
  </dialog>
}
