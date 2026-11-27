import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { BookingSummary } from '../../../shared/types.ts'
import { Modal } from '../../components/ui.tsx'
import { errorText } from '../../lib/api.ts'
import { useAdminApi } from './admin-data.ts'

export function DeleteDialog({ path, title, message, success, close, onDeleted }: {
  path: string; title: string; message: string; success: string; close: () => void; onDeleted?: () => void
}) {
  const admin = useAdminApi()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function remove() {
    setError('')
    setPending(true)
    try {
      await admin.request(path, 'DELETE')
      close()
      onDeleted?.()
      await admin.saved(success)
    } catch (err) {
      setError(errorText(err))
      setPending(false)
    }
  }
  return <Modal title={title} close={() => { if (!pending) close() }}>
    <p>{message}</p>
    {error && <p className="message danger" role="alert">{error}</p>}
    <div className="admin-actions">
      <button className="button outline" type="button" disabled={pending} onClick={close}>Kembali</button>
      <button className="button outline danger-button" type="button" disabled={pending} onClick={() => void remove()}>
        <Trash2 size={16} aria-hidden="true" /> {pending ? 'Menghapus…' : 'Hapus Permanen'}
      </button>
    </div>
  </Modal>
}

export function DeleteBookingButton({ booking, onDeleted }: { booking: BookingSummary; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false)
  return <>
    <button className="button outline danger-button" type="button" aria-label={'Hapus reservasi ' + booking.customer_name}
      onClick={() => setOpen(true)}><Trash2 size={16} aria-hidden="true" /> Hapus</button>
    {open && <DeleteDialog path={'/bookings/' + booking.id} title="Hapus reservasi?"
      message={`Reservasi ${booking.booking_code} atas nama ${booking.customer_name} akan dihapus dari riwayat dan laporan. Slotnya akan dilepas.`}
      success="Reservasi berhasil dihapus." close={() => setOpen(false)} onDeleted={onDeleted} />}
  </>
}
