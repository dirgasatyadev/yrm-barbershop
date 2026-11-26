import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDeferredValue, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { bookingSchema } from '../../../shared/schemas.ts'
import { clock, dateLabel, rupiah, startStamp, today } from '../../../shared/time.ts'
import type { Availability, Barber, Booking, Service } from '../../../shared/types.ts'
import { Empty, Failure, Loading, Modal } from '../../components/ui.tsx'
import { errorText } from '../../lib/api.ts'
import { useAdminApi, useAdminQuery } from './admin-data.ts'
import { Status, statusLabels } from './Dashboard.tsx'

type BookingList = { items: Booking[]; total: number; page: number; pageSize: number }
const initialFilters = { q: '', date: '', status: '', barber_id: '', service_id: '' }
export default function Bookings() {
  const [filters, setFilters] = useState(initialFilters)
  const applied = useDeferredValue(filters)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState('')
  const [manual, setManual] = useState(false)
  const barbers = useAdminQuery<Barber[]>('/barbers')
  const services = useAdminQuery<Service[]>('/services')
  const params = new URLSearchParams(Object.entries(applied).filter(([, value]) => value))
  params.set('page', String(page))
  const list = useAdminQuery<BookingList>('/bookings?' + params)
  function filter(key: keyof typeof filters, value: string) {
    setFilters({ ...filters, [key]: value })
    setPage(1)
  }
  return <div className="admin-stack">
    <header className="section-row admin-heading"><h1>Reservasi</h1>
      <button className="button gold" onClick={() => setManual(true)}><CalendarPlus size={18} /> Tambah Walk-in</button></header>
    <div className="admin-card filter-grid">
      <label className="field">Cari reservasi<input type="search" value={filters.q} maxLength={100} placeholder="Nama atau kode"
        onChange={(e) => filter('q', e.target.value)} /></label>
      <label className="field">Tanggal<input type="date" value={filters.date} onChange={(e) => filter('date', e.target.value)} /></label>
      <label className="field">Capster<select value={filters.barber_id} onChange={(e) => filter('barber_id', e.target.value)}>
        <option value="">Semua capster</option>{barbers.data?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className="field">Layanan<select value={filters.service_id} onChange={(e) => filter('service_id', e.target.value)}>
        <option value="">Semua layanan</option>{services.data?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className="field">Status<select value={filters.status} onChange={(e) => filter('status', e.target.value)}>
        <option value="">Semua status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {(barbers.isError || services.isError) && <Failure error={barbers.error ?? services.error} retry={() => { void barbers.refetch(); void services.refetch() }} />}
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : <>
      {list.data.items.length ? <>
        <div className="table-wrap booking-table"><table>
          <thead><tr><th>Pelanggan</th><th>Layanan</th><th>Capster</th><th>Waktu</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>{list.data.items.map((row) => <tr key={row.id}>
            <td><strong>{row.customer_name}</strong><small className="cell-sub">{row.booking_code}</small></td>
            <td>{row.service_name_snapshot}</td><td>{row.barber_name_snapshot}</td>
            <td>{dateLabel(row.booking_date, true)}<small className="cell-sub">{clock(row.start_time)} WIB</small></td>
            <td><Status status={row.status} /></td><td><button className="button outline" onClick={() => setSelected(row.id)}>Detail</button></td>
          </tr>)}</tbody>
        </table></div>
        <div className="booking-cards">{list.data.items.map((row) => <article className="admin-card" key={row.id}>
          <div className="section-row"><h2>{row.customer_name}</h2><Status status={row.status} /></div>
          <p className="muted">{row.booking_code}</p><p>{row.service_name_snapshot} · {row.barber_name_snapshot}</p>
          <p>{dateLabel(row.booking_date, true)} · {clock(row.start_time)} WIB</p>
          <button className="button outline" onClick={() => setSelected(row.id)}>Detail</button>
        </article>)}</div>
      </> : <Empty>Tidak ada reservasi yang cocok.</Empty>}
      <div className="section-row"><span className="muted">{list.data.total} reservasi · Halaman {page}</span>
        <div className="admin-actions"><button className="button outline" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /> Sebelumnya</button>
          <button className="button outline" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>Berikutnya <ChevronRight size={18} /></button></div></div>
    </>}
    {manual && <Modal title="Tambah reservasi walk-in" close={() => setManual(false)}>
      <ReservationForm services={services.data ?? []} close={() => setManual(false)} /></Modal>}
    {selected && <BookingDetail id={selected} close={() => setSelected('')} />}
  </div>
}
function BookingDetail({ id, close }: { id: string; close: () => void }) {
  const data = useAdminQuery<Booking>('/bookings/' + id)
  const [mode, setMode] = useState<'details' | 'reschedule' | 'cancel'>('details')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const admin = useAdminApi()
  async function setStatus(status: 'completed' | 'no_show' | 'cancelled') {
    setError(''); setPending(true)
    try {
      await admin.request('/bookings/' + id + (status === 'cancelled' ? '/cancel' : ''), status === 'cancelled' ? 'POST' : 'PATCH',
        status === 'cancelled' ? undefined : { status })
      setMode('details')
      await admin.saved(status === 'cancelled' ? 'Reservasi dibatalkan dan slot dibuka kembali.' : 'Status reservasi diperbarui.')
    } catch (err) { setError(errorText(err)) }
    finally { setPending(false) }
  }
  const title = { details: 'Detail reservasi', reschedule: 'Ubah jadwal reservasi', cancel: 'Batalkan reservasi?' }[mode]
  return <Modal title={title} close={mode === 'details' ? close : () => setMode('details')}>
    {data.isPending ? <Loading /> : data.isError ? <Failure error={data.error} retry={() => void data.refetch()} /> :
      mode === 'reschedule' ? <ReservationForm booking={data.data} services={[]} close={() => setMode('details')} /> :
      mode === 'cancel' ? <>
        <p>Batalkan reservasi {data.data.booking_code} atas nama {data.data.customer_name}? Slot tersebut akan dibuka kembali.</p>
        {error && <p className="message danger" role="alert">{error}</p>}
        <div className="admin-actions"><button className="button outline" onClick={() => setMode('details')}>Kembali</button>
          <button className="button outline danger-button" disabled={pending} onClick={() => void setStatus('cancelled')}>Batalkan Reservasi</button></div>
      </> : <>
        {error && <p className="message danger" role="alert">{error}</p>}
        <dl className="summary"><dt>Kode</dt><dd>{data.data.booking_code}</dd><dt>Pelanggan</dt><dd>{data.data.customer_name}</dd>
          <dt>WhatsApp</dt><dd>{data.data.customer_phone || '—'}</dd><dt>Catatan</dt><dd>{data.data.customer_notes || '—'}</dd>
          <dt>Layanan</dt><dd>{data.data.service_name_snapshot}</dd><dt>Capster</dt><dd>{data.data.barber_name_snapshot}</dd>
          <dt>Waktu</dt><dd>{dateLabel(data.data.booking_date)} · {clock(data.data.start_time)}–{clock(data.data.end_time)} WIB</dd>
          <dt>Harga</dt><dd>{rupiah(data.data.price_snapshot)}</dd><dt>Status</dt><dd><Status status={data.data.status} /></dd></dl>
        {data.data.status === 'confirmed' && <div className="admin-actions">
          <button className="button outline" onClick={() => setMode('reschedule')}>Ubah Jadwal</button>
          {startStamp(data.data.booking_date, data.data.start_time) <= Date.now() && <>
            <button className="button outline" disabled={pending} onClick={() => void setStatus('completed')}>Tandai Selesai</button>
            <button className="button outline" disabled={pending} onClick={() => void setStatus('no_show')}>Tandai Tidak Hadir</button>
          </>}
          <button className="button outline danger-button" onClick={() => { setError(''); setMode('cancel') }}>Batalkan</button>
        </div>}
      </>}
  </Modal>
}

function ReservationForm({ booking, services, close }: { booking?: Booking; services: Service[]; close: () => void }) {
  const admin = useAdminApi()
  const availableServices = services.filter((service) => service.is_active)
  const [service, setService] = useState(booking?.service_id ?? availableServices[0]?.id ?? '')
  const [date, setDate] = useState(booking && booking.booking_date > today() ? booking.booking_date : today())
  const [start, setStart] = useState('')
  const [barber, setBarber] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const idempotency = useRef<{ body: string; key: string } | null>(null)
  const parameters = new URLSearchParams({ date, service_id: service, ...(booking ? { booking_id: booking.id } : {}) })
  const availability = useAdminQuery<Availability>('/availability?' + parameters, Boolean(date && service))
  const slots = availability.data?.slots.filter((slot) => slot.state === 'available' && (!booking || startStamp(date, slot.start) >= Date.now())) ?? []
  const slot = slots.find((row) => String(row.start) === start)
  const options = availability.data?.barbers.filter((person) => slot?.barbers.some((option) => option.id === person.id && option.status === 'available')) ?? []
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!slot) return
    setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const payload = { date, start: slot.start, barber_id: barber || null }
    if (booking && !barber) { setError('Pilih capster untuk jadwal baru.'); return }
    const parsed = bookingSchema.safeParse({ ...payload, service_id: service, ...values })
    if (!booking && !parsed.success) { setError(parsed.error.issues[0].message); return }
    setPending(true)
    try {
      if (booking) await admin.request('/bookings/' + booking.id, 'PATCH', payload)
      else {
        const body = JSON.stringify(parsed.data)
        if (idempotency.current?.body !== body) idempotency.current = { body, key: crypto.randomUUID() }
        await admin.request('/bookings', 'POST', parsed.data, idempotency.current.key)
      }
      close()
      await admin.saved(booking ? 'Jadwal reservasi diperbarui.' : 'Reservasi walk-in ditambahkan.')
    } catch (err) {
      setError(errorText(err)); void availability.refetch()
    } finally { setPending(false) }
  }
  const resetSlot = () => { setStart(''); setBarber('') }
  return <form className="fields admin-form" onSubmit={(event) => void submit(event)}>
    {booking ? <p className="muted wide">Layanan {booking.service_name_snapshot} · {booking.duration_snapshot} menit</p> :
      <label className="field">Layanan<select value={service} required onChange={(e) => { setService(e.target.value); resetSlot() }}>
        <option value="">Pilih layanan</option>{availableServices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <label className="field">Tanggal<input type="date" required min={today()} value={date} onChange={(e) => { setDate(e.target.value); resetSlot() }} /></label>
    {availability.isError && <div className="wide"><Failure error={availability.error} retry={() => void availability.refetch()} /></div>}
    <label className="field">Jam mulai (WIB)<select value={start} required onChange={(e) => { setStart(e.target.value); setBarber('') }}>
      <option value="">{availability.isFetching ? 'Memuat jam…' : slots.length ? 'Pilih jam' : 'Tidak ada jam tersedia'}</option>
      {slots.map((item) => <option key={item.start} value={item.start}>{clock(item.start)}</option>)}</select></label>
    <label className="field">Capster<select value={barber} required={Boolean(booking)} disabled={!slot} onChange={(e) => setBarber(e.target.value)}>
      <option value="">{booking ? 'Pilih capster' : 'Capster Mana Saja'}</option>
      {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {!booking && <>
      <label className="field">Nama pelanggan<input name="customer_name" required minLength={2} maxLength={100} /></label>
      <label className="field">WhatsApp (opsional)<input type="tel" name="customer_phone" maxLength={30} /></label>
      <label className="field wide">Catatan (opsional)<textarea name="customer_notes" maxLength={500} rows={2} /></label>
    </>}
    {error && <p className="message danger wide" role="alert">{error}</p>}
    <button className="button gold" disabled={pending || !slot}>{pending ? 'Menyimpan…' : 'Simpan Reservasi'}</button>
  </form>
}
