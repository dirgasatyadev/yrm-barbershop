import { CalendarDays, Clock3, MapPin, MessageCircle, Phone } from 'lucide-react'
import { Link } from 'react-router'
import { clock } from '../../../shared/time.ts'
import { Avatar, Empty, Failure, Loading } from '../../components/ui.tsx'
import { useBarbers, useSettings } from './public-data.ts'

export default function CustomerHome() {
  const barbers = useBarbers()
  const settings = useSettings()
  const business = settings.data
  const socialLinks = [
    ['Instagram', business?.instagram_url], ['TikTok', business?.tiktok_url], ['Facebook', business?.facebook_url],
  ].filter(([, url]) => url)
  return <main className="customer-home">
    {business?.background_url && <div className="customer-background" aria-hidden="true"><img src={business.background_url} alt="" /></div>}
    <section className="customer-hero" aria-labelledby="booking-title">
      <div className="customer-hero-copy">
        <h1 id="booking-title">Reservasi potong rambut</h1>
        <Link to="/booking" className="button primary customer-booking">
          <CalendarDays size={20} aria-hidden="true" /> Booking Sekarang
        </Link>
      </div>
      <div className="customer-hero-photo">
        <img key={business?.cover_url} src={business?.cover_url || '/images/barbershop.webp'} alt="" width="1440" height="960" fetchPriority="high"
          onError={(event) => { if (event.currentTarget.getAttribute('src') !== '/images/barbershop.webp') event.currentTarget.src = '/images/barbershop.webp' }} />
      </div>
    </section>
    <section className="customer-schedule" aria-labelledby="schedule-title">
      <div className="customer-profile">
        <Avatar photo={business?.logo_url ?? ''} name={'profil ' + (business?.name ?? 'YRM Barber')} />
        <div><h2>{business?.name ?? 'YRM Barber'}</h2>{business?.description && <p>{business.description}</p>}</div>
      </div>
      <h2 id="schedule-title">Jadwal Capster Hari Ini</h2>
      {barbers.isPending ? <Loading label="Memuat jadwal capster" /> :
        barbers.isError ? <Failure error={barbers.error} retry={() => void barbers.refetch()} /> :
        !barbers.data.length ? <Empty>Belum ada capster aktif.</Empty> :
        <ul className="customer-schedule-list">
          {barbers.data.map(({ id, name, photo_url, description, work }) => <li key={id}>
            <Avatar photo={photo_url} name={name} />
            <div><span className="schedule-name">{name}</span>{description && <p className="schedule-description">{description}</p>}</div>
            {work.is_day_off ? <span className="badge schedule-status">{work.label}</span> :
              <span className="schedule-hours"><Clock3 size={15} aria-hidden="true" /> {clock(work.start)}–{clock(work.end)} WIB</span>}
          </li>)}
        </ul>}
      {business && (business.contact_phone || business.whatsapp || business.address || socialLinks.length > 0) && <address className="customer-contact" aria-label="Kontak barbershop">
        {business.contact_phone && <a href={'tel:' + business.contact_phone}><Phone size={15} aria-hidden="true" /> {business.contact_phone}</a>}
        {business.whatsapp && <a href={'https://wa.me/' + business.whatsapp.replace(/\D/g, '')} target="_blank" rel="noreferrer">
          <MessageCircle size={15} aria-hidden="true" /> {business.contact_phone ? 'WhatsApp' : 'WhatsApp ' + business.whatsapp}</a>}
        {business.address && <span><MapPin size={15} aria-hidden="true" /> {business.address}</span>}
        {socialLinks.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label}</a>)}
      </address>}
    </section>
  </main>
}
