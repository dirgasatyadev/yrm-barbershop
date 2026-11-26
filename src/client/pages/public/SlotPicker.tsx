import { CalendarX } from 'lucide-react'
import type { Availability, TimeSlot } from '../../../shared/types.ts'
import { clock } from '../../../shared/time.ts'
import { Empty } from '../../components/ui.tsx'

const label: Record<TimeSlot['state'], string> = {
  available: 'Tersedia',
  full: 'Dibooking',
  unavailable: 'Tidak tersedia',
}

function stateFor(slot: TimeSlot, barberId: string): TimeSlot['state'] {
  if (!barberId) return slot.state
  const status = slot.barbers.find((barber) => barber.id === barberId)?.status
  return status === 'booked' ? 'full' : status === 'available' ? 'available' : 'unavailable'
}

export function SlotPicker({ availability, filter, onFilter, onSlot }: {
  availability: Availability
  filter: string
  onFilter: (barberId: string) => void
  onSlot: (start: number, barberId: string | null) => void
}) {
  const barber = availability.barbers.find((person) => person.id === filter)
  const shownBarber = barber?.id ?? ''
  const slots = availability.slots.map((slot) => ({ start: slot.start, state: stateFor(slot, shownBarber) }))
  return <>
    <fieldset className="slot-filters">
      <legend>Lihat slot untuk</legend>
      <div className="slot-filter-options">
        <button type="button" className="button choice" aria-pressed={!shownBarber} onClick={() => onFilter('')}>Semua capster</button>
        {availability.barbers.map((person) => <button key={person.id} type="button" className="button choice"
          aria-pressed={shownBarber === person.id} onClick={() => onFilter(person.id)}>{person.name}</button>)}
      </div>
    </fieldset>
    <div className="section-row"><h2>Jam kedatangan</h2><span className="muted">WIB</span></div>
    <div className="slot-legend">
      <span><i /> Tersedia</span><span><i className="full" /> {barber ? 'Sudah dibooking' : 'Penuh'}</span><span><i className="off" /> Tidak tersedia</span>
    </div>
    {barber?.work.is_day_off && <p className="message"><CalendarX size={18} /> {barber.name} {barber.work.label.toLowerCase()} pada tanggal ini.</p>}
    {!slots.some((slot) => slot.state === 'available') && !barber?.work.is_day_off && <Empty>
      Tidak ada jam kosong. Coba tanggal atau capster lain.
    </Empty>}
    <div className="time-grid">{slots.map((slot) => {
      const status = slot.state === 'full' && !barber ? 'Penuh' : label[slot.state]
      return <button type="button" className={'time ' + slot.state} key={slot.start} disabled={slot.state !== 'available'}
        onClick={() => onSlot(slot.start, shownBarber || null)}>
        <strong>{clock(slot.start)}</strong><small>{status}</small>
      </button>
    })}</div>
  </>
}
