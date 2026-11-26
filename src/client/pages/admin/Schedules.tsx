import { CalendarDays, ChevronLeft, ChevronRight, TriangleAlert, Umbrella } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { rotationSchema, scheduleSchema } from '../../../shared/schemas.ts'
import { addDays, clock, dateLabel, fromClock, monday, today } from '../../../shared/time.ts'
import type { Barber, Rotation, Settings, Shift, WeekCell } from '../../../shared/types.ts'
import { Empty, Failure, Loading, Modal } from '../../components/ui.tsx'
import { errorText } from '../../lib/api.ts'
import { useAdminApi, useAdminQuery } from './admin-data.ts'
import { HourInput } from './Catalog.tsx'

type Week = { week: string; barbers: Barber[]; cells: WeekCell[]; rotation: Rotation }
type Operation = 'generate' | 'rotate' | 'copy'
type Preview = { week: string; revision: number; count: number; cells: WeekCell[] }
const operations: Record<Operation, string> = { generate: 'Buat dari Pola', rotate: 'Rotasi Shift', copy: 'Salin Minggu Lalu' }
const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
export default function Schedules({ daysOff = false }: { daysOff?: boolean }) {
  const [week, setWeek] = useState(() => monday(today()))
  const [selected, select] = useState<WeekCell | null>(null)
  const [rotation, showRotation] = useState(false)
  const [operation, setOperation] = useState<Operation | null>(null)
  const data = useAdminQuery<Week>('/schedules?week=' + week)
  const shifts = useAdminQuery<Shift[]>('/shifts')
  return <div className="admin-stack">
    <header className="admin-heading"><h1>{daysOff ? 'Hari Libur' : 'Jadwal Capster'}</h1>
      <p>{daysOff ? 'Pilih tanggal dan capster untuk mengatur libur.' : 'Atur shift dan pengecualian pada kalender mingguan.'}</p></header>
    <div className="section-row">
      <div className="admin-actions">
        <button className="button outline" onClick={() => setWeek(addDays(week, -7))} aria-label="Minggu sebelumnya"><ChevronLeft size={19} /></button>
        <label className="week-control"><CalendarDays size={16} /><span>{dateLabel(week, true)} – {dateLabel(addDays(week, 6), true)}</span>
          <input type="date" aria-label="Pilih minggu" value={week} min="2000-01-03" max="2099-12-27" onChange={(e) => { if (e.target.value) setWeek(monday(e.target.value)) }} /></label>
        <button className="button outline" onClick={() => setWeek(addDays(week, 7))} aria-label="Minggu berikutnya"><ChevronRight size={19} /></button>
        <button className="button outline" onClick={() => setWeek(monday(today()))}>Minggu Ini</button>
      </div>
      {!daysOff && <button className="button outline" disabled={!data.data || !shifts.data} onClick={() => showRotation(true)}>Atur Pola Rotasi</button>}
    </div>
    {!daysOff && <div className="admin-actions">{Object.entries(operations).map(([key, label]) =>
      <button className="button outline" disabled={!data.data || addDays(week, 6) < today()} key={key} onClick={() => setOperation(key as Operation)}>{label}</button>)}</div>}
    {shifts.isError && <Failure error={shifts.error} retry={() => void shifts.refetch()} />}
    {data.isPending ? <Loading /> : data.isError ? <Failure error={data.error} retry={() => void data.refetch()} /> :
      <Calendar week={week} barbers={data.data.barbers} cells={data.data.cells} onSelect={select} daysOff={daysOff} />}
    {selected && <Modal title={daysOff ? 'Atur hari libur' : 'Ubah jadwal'} close={() => select(null)}>
      <ScheduleForm cell={selected} name={data.data?.barbers.find((barber) => barber.id === selected.barber_id)?.name ?? ''}
        shifts={shifts.data ?? []} daysOff={daysOff} close={() => select(null)} /></Modal>}
    {rotation && data.data && shifts.data && <Modal title="Pola rotasi mingguan" close={() => showRotation(false)}>
      <RotationForm initial={data.data.rotation} shifts={shifts.data} barbers={data.data.barbers} close={() => showRotation(false)} /></Modal>}
    {operation && data.data && <WeekPreview week={week} action={operation} barbers={data.data.barbers} close={() => setOperation(null)} />}
  </div>
}
function Calendar({ week, barbers, cells, onSelect, daysOff = false }: {
  week: string; barbers: Barber[]; cells: WeekCell[]; onSelect?: (cell: WeekCell) => void; daysOff?: boolean
}) {
  if (!barbers.length) return <Empty>Tambahkan capster untuk mengatur jadwal.</Empty>
  const keyed = new Map(cells.map((cell) => [cell.barber_id + ':' + cell.date, cell]))
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  return <div className="table-wrap calendar-wrap" tabIndex={0} aria-label="Kalender mingguan, geser untuk melihat semua hari">
    <table className="calendar-table"><thead><tr><th>Capster</th>
      {dates.map((date, i) => <th key={date} scope="col">{days[i]}<small className="cell-sub">{date.slice(8)}/{date.slice(5, 7)}</small></th>)}</tr></thead>
      <tbody>{barbers.map((barber) => <tr key={barber.id}><th scope="row">{barber.name}</th>{dates.map((date) => {
        const cell = keyed.get(barber.id + ':' + date)
        if (!cell) return <td key={date}>—</td>
        const work = cell.work
        const content = <><strong>{work.is_day_off && work.label === 'Libur' && <Umbrella size={13} />} {daysOff && !work.is_day_off ? 'Bekerja' : work.label}</strong>
          {!work.is_day_off && <small>{clock(work.start)}–{clock(work.end)}</small>}
          {cell.conflicts.length > 0 && <small className="calendar-warning"><TriangleAlert size={13} /> {cell.conflicts.length} konflik</small>}</>
        return <td key={date}><div className={'calendar-cell ' + (work.is_day_off ? 'day-off' : '') + (cell.conflicts.length ? ' has-conflict' : '')}>
          {onSelect ? <button type="button" disabled={date < today() || !barber.is_active} onClick={() => onSelect(cell)}
            aria-label={barber.name + ', ' + dateLabel(date) + ', ' + work.label}>{content}</button> : <div>{content}</div>}
        </div></td>
      })}</tr>)}</tbody></table></div>
}
function ScheduleForm({ cell, name, shifts, daysOff, close }: { cell: WeekCell; name: string; shifts: Shift[]; daysOff: boolean; close: () => void }) {
  const admin = useAdminApi()
  const { data: settings } = useAdminQuery<Settings>('/settings')
  const explicit = cell.schedule
  const [mode, setMode] = useState(daysOff || cell.work.is_day_off ? 'off' : explicit?.start_time !== null && explicit?.start_time !== undefined ? 'custom' : 'shift')
  const currentShift = !cell.work.is_day_off && shifts.find((shift) => shift.name === cell.work.label)
  const [shiftId, setShift] = useState(explicit?.shift_id ?? (currentShift ? currentShift.id : '') ?? '')
  const [start, setStart] = useState(cell.work.is_day_off ? '' : clock(cell.work.start))
  const [end, setEnd] = useState(cell.work.is_day_off ? '' : clock(cell.work.end))
  const [notes, setNotes] = useState(explicit?.notes ?? '')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = scheduleSchema.safeParse({ barber_id: cell.barber_id, schedule_date: cell.date, is_day_off: mode === 'off',
      shift_id: mode === 'shift' ? shiftId : null, start_time: mode === 'custom' ? fromClock(start) : null,
      end_time: mode === 'custom' ? fromClock(end) : null, notes,
    })
    if (!result.success) { setError(result.error.issues[0].message); return }
    setError(''); setPending(true)
    try {
      await admin.request('/schedules' + (explicit ? '/' + explicit.id : ''), explicit ? 'PATCH' : 'POST', result.data)
      close(); await admin.saved('Jadwal berhasil disimpan.')
    } catch (err) { setError(errorText(err)) }
    finally { setPending(false) }
  }
  return <form className="fields admin-form" onSubmit={(event) => void save(event)}>
    <p className="wide">{name} · {dateLabel(cell.date)}</p>
    <label className="field wide">Jenis jadwal<select value={mode} onChange={(e) => setMode(e.target.value)}>
      <option value="shift">Shift</option><option value="custom">Jam khusus</option><option value="off">Libur</option>
    </select></label>
    {mode === 'shift' && <label className="field wide">Shift<select required value={shiftId} onChange={(e) => setShift(e.target.value)}>
      <option value="">Pilih shift</option>{shifts.filter((shift) => shift.is_active).map((shift) => <option value={shift.id} key={shift.id}>
        {shift.name} · {clock(shift.start_time)}–{clock(shift.end_time)}</option>)}</select></label>}
    {mode === 'custom' && <><label className="field">Jam mulai (WIB)<HourInput value={start} onChange={setStart} /></label>
      <label className="field">Jam selesai (WIB)<HourInput value={end} onChange={setEnd} /></label></>}
    {settings && <p className="wide muted">Jam operasional {clock(settings.opens)}–{clock(settings.closes)} WIB.</p>}
    <label className="field wide">Catatan (opsional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300} /></label>
    {error && <p className="message danger wide" role="alert">{error}</p>}
    <button className="button gold" disabled={pending}>Simpan Jadwal</button>
  </form>
}
function RotationForm({ initial, shifts, barbers, close }: { initial: Rotation; shifts: Shift[]; barbers: Barber[]; close: () => void }) {
  const admin = useAdminApi()
  const [state, setState] = useState(initial)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const active = barbers.filter((barber) => barber.is_active)
  function change(barber_id: string, week: number, patch: Partial<Rotation['rules'][number]>) {
    const old = state.rules.find((rule) => rule.barber_id === barber_id && rule.week === week)
    const rule = { barber_id, week, shift_id: '', off_weekday: 0, ...old, ...patch }
    setState({ ...state, rules: [...state.rules.filter((item) => item !== old), rule] })
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = rotationSchema.safeParse({ ...state, rules: state.rules.filter((rule) => rule.week < state.length && rule.shift_id) })
    if (!result.success) { setError(result.error.issues[0].message); return }
    setPending(true); setError('')
    try {
      await admin.request('/rotation', 'PATCH', result.data)
      close(); await admin.saved('Pola rotasi tersimpan.')
    } catch (err) { setError(errorText(err)) }
    finally { setPending(false) }
  }
  return <form className="fields" onSubmit={(event) => void save(event)}>
    <p className="muted">Pola berlaku pada tanggal yang belum memiliki jadwal khusus. Setiap capster yang memiliki shift memperoleh satu hari libur per minggu.</p>
    <div className="admin-form"><label className="field">Tanggal acuan minggu pertama<input type="date" value={state.anchor} required
      onChange={(e) => setState({ ...state, anchor: e.target.value })} /></label>
      <label className="field">Panjang siklus (minggu)<input type="number" min={1} max={12} required value={state.length}
        onChange={(e) => setState({ ...state, length: Number(e.target.value) })} /></label></div>
    {Array.from({ length: Math.min(12, Math.max(0, state.length)) }, (_, week) => <fieldset className="rotation-week" key={week}>
      <legend>Minggu {week + 1}</legend>{!active.length && <p className="muted">Belum ada capster aktif.</p>}
      {active.map((barber) => {
        const rule = state.rules.find((item) => item.barber_id === barber.id && item.week === week)
        return <div className="rotation-row" key={barber.id}><strong>{barber.name}</strong>
          <label className="field">Shift<select value={rule?.shift_id ?? ''} onChange={(e) => change(barber.id, week, { shift_id: e.target.value })}>
            <option value="">Belum terjadwal</option>{shifts.filter((shift) => shift.is_active || rule?.shift_id === shift.id)
              .map((shift) => <option value={shift.id} key={shift.id}>{shift.name}{!shift.is_active && ' (nonaktif)'}</option>)}</select></label>
          <label className="field">Libur<select value={rule?.off_weekday ?? 0} disabled={!rule?.shift_id}
            onChange={(e) => change(barber.id, week, { off_weekday: Number(e.target.value) })}>
            {days.map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label></div>
      })}
    </fieldset>)}
    {error && <p className="message danger" role="alert">{error}</p>}
    <button className="button gold" disabled={pending}>Simpan Pola</button>
  </form>
}
function WeekPreview({ week, action, barbers, close }: { week: string; action: Operation; barbers: Barber[]; close: () => void }) {
  const admin = useAdminApi()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const conflicts = Array.from(new Set(preview?.cells.flatMap((cell) => cell.conflicts)))
  async function submit(apply: boolean) {
    setPending(true); setError('')
    try {
      const value = await admin.request<Preview>('/schedules/' + action, 'POST', { week, preview: !apply, ...(apply && { expected_revision: preview?.revision }) })
      if (!apply) setPreview(value)
      else { close(); await admin.saved('Jadwal mingguan diterapkan.') }
    } catch (err) { setError(errorText(err)); if (apply) setPreview(null) }
    finally { setPending(false) }
  }
  return <Modal title={operations[action]} close={close}>
    <p>{dateLabel(week)} sampai {dateLabel(addDays(week, 6))}. Jadwal khusus pada tanggal yang tercakup akan diganti.</p>
    {preview && <><p className="muted">{preview.count} jadwal capster dalam pratinjau.</p><Calendar week={week} cells={preview.cells} barbers={barbers} /></>}
    {conflicts.length > 0 && <p className="message danger" role="alert">Selesaikan konflik reservasi terlebih dahulu. Kode {conflicts.join(', ')}.</p>}
    {error && <p className="message danger" role="alert">{error}</p>}
    <div className="admin-actions">
      <button className="button outline" disabled={pending} onClick={() => void submit(false)}>Perbarui Pratinjau</button>
      {preview && <button className="button gold" disabled={pending || Boolean(conflicts.length) || !preview.count} onClick={() => void submit(true)}>Terapkan Jadwal</button>}
    </div>
  </Modal>
}
