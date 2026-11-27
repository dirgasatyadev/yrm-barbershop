import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Check, CheckCircle2, ChevronLeft, Clock3, Copy, Droplets, Info, MessageCircle, Scissors, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { customerSchema } from '../../../shared/schemas.ts'
import { addDays, clock, dateLabel, rupiah, today } from '../../../shared/time.ts'
import type { Availability, BookingReceipt, Service } from '../../../shared/types.ts'
import { Avatar, Empty, Failure, Loading, useToast } from '../../components/ui.tsx'
import { api, errorText, publicKey, RequestError } from '../../lib/api.ts'
import { useServices, useSettings } from './public-data.ts'
import { SlotPicker } from './SlotPicker.tsx'

const steps = ['Layanan', 'Waktu', 'Capster', 'Data diri', 'Konfirmasi', 'Berhasil']
const statusLabel = { available: 'Tersedia', booked: 'Sudah dibooking', off: 'Libur / belum terjadwal', outside: 'Di luar jam kerja' }
function ServiceCard({ service, select }: { service: Service; select: () => void }) {
  const Icon = /keramas/i.test(service.name) ? Droplets : Scissors
  return <article className="public-card service-card">
    <span className="feature-icon"><Icon size={23} strokeWidth={1.6} aria-hidden="true" /></span>
    <h3>{service.name}</h3>
    {service.description && <p>{service.description}</p>}
    <div className="service-meta"><strong>{rupiah(service.price)}</strong><span><Clock3 size={15} /> {service.duration_minutes} menit</span></div>
    <button type="button" className="button primary service-action" onClick={select}>Pilih Layanan</button>
  </article>
}
const whatsappUrl = (number: string) => 'https://wa.me/' + number.replace(/\D/g, '')

function Frame({ step, children }: { step: number; children: React.ReactNode }) {
  return <main className="booking-shell">
    {step < 5 && <Link className="text-button booking-home-link" to="/"><ChevronLeft size={17} aria-hidden="true" /> Kembali ke Beranda</Link>}
    <ol className="steps" aria-label="Progres reservasi">{steps.map((label, index) =>
      <li key={label} aria-current={step === index ? 'step' : undefined} className={index <= step ? 'reached' : ''}>
        <span>{index < step ? <Check size={16} /> : index + 1}</span><small>{label}</small>
      </li>)}</ol>
    <section className="booking-panel">{children}</section>
  </main>
}
export default function BookingWizard() {
  const settings = useSettings()
  const services = useServices()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const query = useQueryClient()
  const toast = useToast()
  const [step, changeStep] = useState(params.has('layanan') ? 1 : 0)
  const [serviceId, setService] = useState(params.get('layanan') ?? '')
  const [date, setDate] = useState(today)
  const [start, setStart] = useState<number | null>(null)
  const [capster, setCapster] = useState<string | null>(null)
  const [slotBarber, setSlotBarber] = useState('')
  const [fields, setFields] = useState({ customer_name: '', customer_phone: '' })
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const key = useRef<{ payload: string; value: string } | null>(null)
  const submitting = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const service = services.data?.find((item) => item.id === serviceId)
  const config = settings.data
  const effectiveStep = step && !service && services.isSuccess ? 0 : step
  const slots = useQuery({
    queryKey: [...publicKey('availability'), date, serviceId],
    queryFn: ({ signal }) => api<Availability>('/public/availability?' + new URLSearchParams({ date, service_id: serviceId }), { signal }),
    enabled: effectiveStep >= 1 && Boolean(service && config?.online_enabled && date),
    staleTime: 0, refetchInterval: 30_000,
  })
  const slot = slots.data?.slots.find((item) => item.start === start)
  const selectedBarber = slots.data?.barbers.find((item) => item.id === capster)
  useEffect(() => { heading.current?.focus() }, [effectiveStep])
  function go(index: number) { setMessage(''); changeStep(index) }
  function validateCustomer() {
    const valid = customerSchema.safeParse(fields)
    if (!valid.success) { setMessage(valid.error.issues[0].message); return false }
    if (config?.phone_required && !valid.data.customer_phone) { setMessage('Nomor WhatsApp wajib diisi.'); return false }
    return true
  }
  async function submit() {
    if (!service || start === null || submitting.current || !validateCustomer()) return
    const body = { ...fields, date, start, service_id: service.id, barber_id: capster,
      quote: { price: service.price, duration_minutes: service.duration_minutes } }
    const payload = JSON.stringify(body)
    if (key.current?.payload !== payload) key.current = { payload, value: crypto.randomUUID() }
    submitting.current = true
    setPending(true)
    setMessage('')
    try {
      const receipt = await api<BookingReceipt>('/public/bookings', { method: 'POST', body, key: key.current.value })
      void query.invalidateQueries({ queryKey: publicKey('availability') })
      navigate('/booking/berhasil', { state: receipt, replace: true })
    } catch (error) {
      const detail = errorText(error)
      setMessage(detail)
      toast(detail, 'error')
      if (error instanceof RequestError && error.status === 409) {
        if (error.code === 'BOOKING_DELETED') key.current = null
        setStart(null)
        setCapster(null)
        changeStep(1)
        void slots.refetch()
        void settings.refetch()
        void services.refetch()
      }
    } finally { setPending(false); submitting.current = false }
  }
  function selectDate(day: string) {
    setDate(day); setStart(null); setCapster(null); setMessage('')
  }
  const titles = ['Pilih layanan', 'Pilih tanggal dan jam', 'Pilih capster', 'Data pelanggan', 'Konfirmasi reservasi']
  return <Frame step={effectiveStep}>
    <h1 tabIndex={-1} ref={heading}>{titles[effectiveStep]}</h1>
    {settings.isPending || services.isPending ? <Loading /> : settings.isError || services.isError ?
      <Failure error={settings.error ?? services.error} retry={() => { void settings.refetch(); void services.refetch() }} /> :
      !config?.online_enabled ? <Empty>Reservasi online sedang ditutup sementara.</Empty> :
      <>
        {message && <p className="message danger" role="alert">{message}</p>}
        {effectiveStep === 0 && (services.data?.length ? <div className="services-grid booking-services">{services.data.map((item) =>
          <ServiceCard key={item.id} service={item} select={() => {
            setService(item.id); setStart(null); setCapster(null); go(1)
          }} />)}</div> : <Empty>Belum ada layanan yang bisa dipesan.</Empty>)}
        {effectiveStep === 1 && service && <>
          <p className="muted">{service.name} · {service.duration_minutes} menit</p>
          <div className="dates">
            <label className="field date-input">Tanggal kedatangan<input type="date" value={date} min={today()} max={addDays(today(), config.max_days)}
              onChange={(e) => { if (e.target.value) selectDate(e.target.value) }} /></label>
            <div className="quick-dates" aria-label="Tanggal terdekat">{Array.from({ length: Math.min(config.max_days + 1, 5) }, (_, i) => addDays(today(), i)).map((day) =>
              <button type="button" key={day} className="button choice" aria-pressed={date === day} onClick={() => selectDate(day)}>
                {day === today() ? 'Hari ini' : dateLabel(day, true)}</button>)}</div>
          </div>
          {slots.isPending ? <Loading /> : slots.isError ? <Failure error={slots.error} retry={() => void slots.refetch()} /> :
            <SlotPicker availability={slots.data} filter={slotBarber} onFilter={setSlotBarber} onSlot={(time, barberId) => {
              setStart(time); setCapster(barberId); go(barberId ? 3 : 2)
            }} />}
        </>}
        {effectiveStep === 2 && <>
          <p className="muted">{dateLabel(date)} · {start !== null && clock(start)} WIB</p>
          {slots.isError && <Failure error={slots.error} retry={() => void slots.refetch()} />}
          {slot?.state === 'available' && <button className="button outline any-capster" onClick={() => { setCapster(null); go(3) }}><Users size={20} /> Capster Mana Saja</button>}
          {slot && slot.state !== 'available' && <Empty>Capster tidak tersedia. Kembali untuk memilih jam lain.</Empty>}
          <div className="team-grid booking-team">{slots.data?.barbers.map((barber) => {
            const status = slot?.barbers.find((item) => item.id === barber.id)?.status ?? 'outside'
            return <article className="public-card team-card" key={barber.id}><Avatar photo={barber.photo_url} name={barber.name} /><h3>{barber.name}</h3>
              <span className={'badge ' + (status === 'available' ? 'good' : status === 'booked' ? 'bad' : '')}>{statusLabel[status]}</span>
              {!barber.work.is_day_off && <p className="muted">{clock(barber.work.start)}–{clock(barber.work.end)} WIB</p>}
              <button className="button primary" disabled={status !== 'available'} onClick={() => { setCapster(barber.id); go(3) }}>Pilih Capster</button>
            </article>
          })}</div>
          {config.whatsapp && <a className="button outline whatsapp" href={whatsappUrl(config.whatsapp)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Konsultasi WhatsApp</a>}
        </>}
        {effectiveStep === 3 && <form className="fields" onSubmit={(event) => { event.preventDefault(); if (validateCustomer()) go(4) }}>
          <div className="selected-capster"><Avatar photo={selectedBarber?.photo_url ?? ''} name={selectedBarber?.name ?? 'capster'} />
            <div><span>Capster</span><strong>{selectedBarber?.name ?? 'Capster Mana Saja'}</strong></div>
          </div>
          <label className="field">Nama pelanggan<input required minLength={2} maxLength={100} autoComplete="name" value={fields.customer_name}
            onChange={(e) => setFields({ ...fields, customer_name: e.target.value })} /></label>
          <label className="field">Nomor WhatsApp {config.phone_required ? '' : '(opsional)'}<input type="tel" required={config.phone_required}
            autoComplete="tel" maxLength={30} value={fields.customer_phone} onChange={(e) => setFields({ ...fields, customer_phone: e.target.value })} /></label>
          <button className="button primary" type="submit">Tinjau Reservasi</button>
        </form>}
        {effectiveStep === 4 && service && start !== null && <>
          <dl className="summary">
            <dt>Nama pelanggan</dt><dd>{fields.customer_name}</dd>
            <dt>Layanan</dt><dd>{service.name}</dd><dt>Durasi</dt><dd>{service.duration_minutes} menit</dd>
            <dt>Capster</dt><dd>{selectedBarber?.name ?? 'Capster Mana Saja'}</dd>
            <dt>Tanggal</dt><dd>{dateLabel(date)}</dd>
            <dt>Jam mulai</dt><dd>{clock(start)} WIB</dd><dt>Estimasi selesai</dt><dd>{clock(start + service.duration_minutes)} WIB</dd>
            <dt className="summary-total">Total harga</dt><dd className="summary-total">{rupiah(service.price)}</dd>
          </dl>
          {config.confirm_notice && <p className="booking-notice"><Info size={20} aria-hidden="true" /> {config.confirm_notice}</p>}
          <button className="button primary" type="button" disabled={pending} onClick={() => void submit()}>{pending ? 'Menyimpan…' : 'Konfirmasi Booking'}</button>
        </>}
        {effectiveStep > 0 && <button type="button" className="text-button wizard-back" disabled={pending}
          onClick={() => go(effectiveStep === 3 && capster && capster === slotBarber ? 1 : effectiveStep - 1)}>
          <ChevronLeft size={17} /> Kembali</button>}
      </>}
  </Frame>
}
export function BookingSuccess() {
  const { state } = useLocation()
  const result = state as BookingReceipt | null
  const toast = useToast()
  async function copy() {
    if (!result) return
    try { await navigator.clipboard.writeText(result.booking_code); toast('Kode reservasi disalin.') }
    catch { toast('Penyalinan gagal. Pilih dan salin kode secara manual.', 'error') }
  }
  return <Frame step={5}>
    {result ? <div className="success">
      <CheckCircle2 className="success-icon" size={48} strokeWidth={1.6} />
      <h1>Reservasi berhasil!</h1><p className="muted">{result.confirmation}</p>
      <div className="booking-code"><span>Kode reservasi</span><strong>{result.booking_code}</strong>
        <button className="button outline" onClick={() => void copy()}><Copy size={16} /> Salin kode</button></div>
      <dl className="summary"><dt>Pelanggan</dt><dd>{result.customer_name}</dd>
        <dt>Layanan</dt><dd>{result.service_name_snapshot}</dd><dt>Capster</dt><dd>{result.barber_name_snapshot}</dd>
        <dt><CalendarDays size={16} /> Tanggal</dt><dd>{dateLabel(result.booking_date)}</dd>
        <dt><Clock3 size={16} /> Waktu</dt><dd>{clock(result.start_time)}–{clock(result.end_time)} WIB</dd>
        <dt>Durasi</dt><dd>{result.duration_snapshot} menit</dd><dt className="summary-total">Total harga</dt><dd className="summary-total">{rupiah(result.price_snapshot)}</dd>
      </dl>
      <Link className="button gold" to="/">Kembali ke Beranda</Link>
    </div> : <><h1>Detail reservasi</h1><Empty>Ringkasan reservasi tidak tersedia pada halaman ini.</Empty><Link className="button outline" to="/">Kembali ke Beranda</Link></>}
  </Frame>
}
