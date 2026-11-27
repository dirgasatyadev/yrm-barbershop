import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { clock, dateLabel } from '../../../shared/time.ts'
import type { BookingInbox } from '../../../shared/types.ts'
import { Empty, Failure, Loading, Modal, useToast } from '../../components/ui.tsx'
import { adminKey, api, errorText } from '../../lib/api.ts'
import { useAdminApi } from './admin-data.ts'
import { useBookingSound } from './booking-sound.ts'

const path = '/booking-notifications'

export default function BookingNotifications() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const lastObserved = useRef<number | null>(null)
  const toast = useToast()
  const admin = useAdminApi()
  const cache = useQueryClient()
  const { active: soundActive, supported: soundSupported, play, toggle } = useBookingSound()
  const inbox = useQuery({ queryKey: adminKey(path), queryFn: ({ signal }) => api<BookingInbox>('/admin' + path, { signal }),
    refetchInterval: 15_000, refetchIntervalInBackground: soundActive, staleTime: 0 })
  const data = inbox.data
  const unread = data?.unread ?? 0

  useEffect(() => {
    if (!data) return
    const newest = data.items[0]?.id ?? data.last_seen_id
    const previous = lastObserved.current
    if (previous === null) { lastObserved.current = newest; return }
    if (newest <= previous) return
    lastObserved.current = newest
    if (newest > data.last_seen_id) {
      toast('Reservasi online baru masuk. Cek lonceng notifikasi.')
      play()
    }
    void cache.invalidateQueries({ predicate: ({ queryKey: [scope, key] }) =>
      scope === 'admin' && (key === '/dashboard' || (typeof key === 'string' && key.startsWith('/bookings?'))) })
  }, [data, cache, toast, play])

  async function markRead(through: number) {
    setPending(true)
    setError('')
    try {
      await admin.request(path + '/read', 'POST', { through })
      await cache.invalidateQueries({ queryKey: adminKey(path) })
    } catch (err) { setError(errorText(err)) }
    finally { setPending(false) }
  }

  return <>
    <button className="button outline notification-bell" aria-label={'Notifikasi reservasi' + (unread ? `, ${unread} belum dibaca` : '')}
      aria-haspopup="dialog" type="button" onClick={() => { setError(''); setOpen(true) }}>
      <Bell size={19} aria-hidden="true" /><span className="notification-label">Notifikasi</span>
      {unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <Modal title="Notifikasi reservasi" close={() => setOpen(false)}>
      {soundSupported && <div className="section-row">
        <span className="muted">Suara notifikasi</span>
        <button className="button outline" type="button" onClick={() => void toggle()}>
          {soundActive ? <Volume2 size={17} aria-hidden="true" /> : <VolumeX size={17} aria-hidden="true" />}
          {soundActive ? 'Bisukan suara' : 'Aktifkan suara'}
        </button>
      </div>}
      {inbox.isPending ? <Loading /> : inbox.isError ? <Failure error={inbox.error} retry={() => void inbox.refetch()} /> : <>
        {error && <p className="message danger" role="alert">{error}</p>}
        {unread > 0 && <div className="section-row"><span>{unread} belum dibaca</span>
          <button className="button outline" type="button" disabled={pending}
            onClick={() => void markRead(inbox.data.items[0].id)}>Tandai sudah dibaca</button></div>}
        {inbox.data.items.length ? <ul className="data-list notification-list">{inbox.data.items.map((item) => <li key={item.id}>
          <Link to={'/admin/reservasi?booking=' + encodeURIComponent(item.booking_id)} onClick={() => setOpen(false)}>
            <span><strong>{item.customer_name}</strong> · {item.barber_name_snapshot}
              <small>{item.booking_code} · {dateLabel(item.booking_date, true)} · {clock(item.start_time)} WIB</small></span>
            {item.id > inbox.data.last_seen_id && <span className="badge warn">Baru</span>}
          </Link>
        </li>)}</ul> : <Empty>Belum ada notifikasi reservasi.</Empty>}
      </>}
    </Modal>}
  </>
}
