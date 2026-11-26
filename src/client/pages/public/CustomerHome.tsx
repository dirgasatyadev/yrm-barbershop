import { CalendarDays, Clock3 } from 'lucide-react'
import { Link } from 'react-router'
import { clock } from '../../../shared/time.ts'
import { Avatar, Empty, Failure, Loading } from '../../components/ui.tsx'
import { useBarbers } from './public-data.ts'

export default function CustomerHome() {
  const barbers = useBarbers()
  return <main className="customer-home">
    <section className="customer-hero" aria-labelledby="booking-title">
      <div className="customer-hero-copy">
        <h1 id="booking-title">Reservasi potong rambut</h1>
        <Link to="/booking" className="button gold customer-booking">
          <CalendarDays size={20} aria-hidden="true" /> Booking Sekarang
        </Link>
      </div>
      <div className="customer-hero-photo">
        <img src="/images/barbershop.webp" alt="" width="1440" height="960" fetchPriority="high" />
      </div>
    </section>
    <section className="customer-schedule" aria-labelledby="schedule-title">
      <h2 id="schedule-title">Jadwal Capster Hari Ini</h2>
      {barbers.isPending ? <Loading label="Memuat jadwal capster" /> :
        barbers.isError ? <Failure error={barbers.error} retry={() => void barbers.refetch()} /> :
        !barbers.data.length ? <Empty>Belum ada capster aktif.</Empty> :
        <ul className="customer-schedule-list">
          {barbers.data.map(({ id, name, photo_url, work }) => <li key={id}>
            <Avatar photo={photo_url} name="" />
            <span className="schedule-name">{name}</span>
            {work.is_day_off ? <span className="badge schedule-status">{work.label}</span> :
              <span className="schedule-hours"><Clock3 size={15} aria-hidden="true" /> {clock(work.start)}–{clock(work.end)} WIB</span>}
          </li>)}
        </ul>}
    </section>
  </main>
}
