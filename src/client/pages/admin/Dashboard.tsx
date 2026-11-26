import { CalendarCheck, CalendarClock, CheckCircle2, CircleDollarSign, Users, XCircle } from 'lucide-react'
import type { BookingStatus, Dashboard as Data } from '../../../shared/types.ts'
import { clock, dateLabel, rupiah } from '../../../shared/time.ts'
import { Empty, Failure, Loading } from '../../components/ui.tsx'
import { useAdminQuery } from './admin-data.ts'

export const statusLabels: Record<BookingStatus, string> = {
  confirmed: 'Terkonfirmasi', completed: 'Selesai', cancelled: 'Dibatalkan', no_show: 'Tidak hadir',
}
export function Status({ status }: { status: BookingStatus }) {
  return <span className={'badge ' + ({ confirmed: 'warn', completed: 'good', cancelled: 'bad', no_show: '' })[status]}>{statusLabels[status]}</span>
}
export default function Dashboard() {
  const data = useAdminQuery<Data>('/dashboard')
  if (data.isPending) return <Loading />
  if (data.isError) return <Failure error={data.error} retry={() => void data.refetch()} />
  const info = data.data
  const cards = [
    ['Total hari ini', info.total, CalendarCheck], ['Reservasi mendatang', info.upcoming, CalendarClock],
    ['Selesai hari ini', info.completed, CheckCircle2], ['Dibatalkan hari ini', info.cancelled, XCircle],
    ['Estimasi nilai hari ini', rupiah(info.estimate), CircleDollarSign],
    ['Nilai layanan selesai', rupiah(info.completed_value), CheckCircle2], ['Capster bertugas', info.active, Users],
  ] as const
  const max = Math.max(1, ...info.week.map((row) => row.total))
  const top = Math.max(1, ...info.popular.map((row) => row.total))
  return <div className="admin-stack">
    <header className="admin-heading"><h1>Dashboard</h1><p>{dateLabel(info.date)} · WIB</p></header>
    <div className="metric-grid">{cards.map(([label, value, Icon]) => <section className="admin-card metric" key={label}>
      <Icon size={20} /><span>{label}</span><strong>{value}</strong></section>)}</div>
    <p className="muted">Nilai dihitung dari harga layanan pada reservasi. Pembayaran dicatat di luar sistem.</p>
    <div className="dashboard-grid">
      <section className="admin-card chart"><h2>Reservasi 7 hari terakhir</h2>
        <div className="bars" aria-label="Jumlah reservasi per hari">{info.week.map((row) => <div className="bar-item" key={row.date}>
          <span>{row.total}</span><div className="bar-track"><span style={{ height: (row.total / max) * 100 + '%' }} /></div><small>{dateLabel(row.date, true).split(',')[0]}</small>
        </div>)}</div>
      </section>
      <section className="admin-card chart"><h2>Layanan terpopuler</h2><p className="muted">30 hari terakhir</p>
        {!info.popular.length ? <Empty>Belum ada layanan yang dipesan.</Empty> :
          <div className="rankings">{info.popular.map((row) => <div key={row.name}>
            <div className="section-row"><span>{row.name}</span><strong>{row.total}</strong></div>
            <div className="rank-track"><span style={{ width: (row.total / top) * 100 + '%' }} /></div>
          </div>)}</div>}
      </section>
      <section className="admin-card"><h2>Jadwal hari ini</h2>
        {info.schedule.length ? <ul className="data-list">{info.schedule.map((row) => <li key={row.id}><strong>{row.name}</strong>
          <span>{row.work.is_day_off ? row.work.label : row.work.label + ' · ' + clock(row.work.start) + '–' + clock(row.work.end)}</span></li>)}</ul>
          : <Empty>Belum ada capster aktif.</Empty>}
      </section>
      <section className="admin-card"><h2>Reservasi terbaru</h2>
        {info.recent.length ? <ul className="data-list">{info.recent.map((row) => <li key={row.id}>
          <div><strong>{row.customer_name}</strong><small>{row.booking_code} · {dateLabel(row.booking_date, true)} {clock(row.start_time)}</small></div>
          <Status status={row.status} /></li>)}</ul> : <Empty>Belum ada reservasi.</Empty>}
      </section>
    </div>
  </div>
}
