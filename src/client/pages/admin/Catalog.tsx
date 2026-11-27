import { Plus, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import type { FormEvent } from 'react'
import type { z } from 'zod'
import { barberSchema, defaults, serviceSchema, settingsSchema, shiftSchema } from '../../../shared/schemas.ts'
import { clock, fromClock, rupiah } from '../../../shared/time.ts'
import type { Barber, Service, Settings, Shift } from '../../../shared/types.ts'
import { Avatar, Empty, Failure, Loading, Modal } from '../../components/ui.tsx'
import { errorText } from '../../lib/api.ts'
import { useAdminApi, useAdminQuery } from './admin-data.ts'
import { ImageField } from './ImageField.tsx'
import type { ImageEdit } from './ImageField.tsx'
import { DeleteDialog } from './DeleteDialog.tsx'

type Kind = 'services' | 'barbers' | 'shifts'
type CatalogItem = Service | Barber | Shift
type Field = { name: string; label: string; section?: string; type?: 'text' | 'textarea' | 'number' | 'check' | 'time' | 'url' | 'image'; min?: number; max?: number; step?: number; optional?: boolean; uploadOnly?: boolean }
const active: Field = { name: 'is_active', label: 'Aktif', type: 'check' }
const sort: Field = { name: 'sort_order', label: 'Urutan tampilan', type: 'number', min: 0, max: 9999 }
const description: Field = { name: 'description', label: 'Deskripsi', type: 'textarea', max: 1000, optional: true }
const configs: Record<Kind, { title: string; singular: string; schema: z.ZodType; fields: Field[]; initial: Record<string, unknown> }> = {
  services: {
    title: 'Layanan', singular: 'layanan', schema: serviceSchema,
    fields: [{ name: 'name', label: 'Nama layanan', max: 100 }, description, { name: 'price', label: 'Harga (Rp)', type: 'number', min: 0, max: 100000000 },
      { name: 'duration_minutes', label: 'Durasi (menit)', type: 'number', min: 5, max: 480, step: 5 }, sort, active],
    initial: { name: '', description: '', price: 0, duration_minutes: 30, sort_order: 0, is_active: true },
  },
  barbers: {
    title: 'Capster', singular: 'capster', schema: barberSchema,
    fields: [{ name: 'name', label: 'Nama capster', max: 100 }, { name: 'photo_url', label: 'Foto capster', type: 'image' },
      description, sort, active],
    initial: { name: '', photo_url: '', description: '', sort_order: 0, is_active: true },
  },
  shifts: {
    title: 'Shift Kerja', singular: 'shift', schema: shiftSchema,
    fields: [{ name: 'name', label: 'Nama shift', max: 100 }, { name: 'start_time', label: 'Jam mulai (WIB)', type: 'time' },
      { name: 'end_time', label: 'Jam selesai (WIB)', type: 'time' }, active],
    initial: { name: '', start_time: 480, end_time: 960, is_active: true },
  },
}
const businessFields: Field[] = [
  { name: 'name', label: 'Nama barbershop', section: 'Profil dan kontak', max: 100 },
  { ...description, label: 'Deskripsi barbershop' },
  { name: 'contact_phone', label: 'Nomor telepon dengan kode negara', max: 16, optional: true },
  { name: 'whatsapp', label: 'WhatsApp dengan kode negara', max: 16, optional: true },
  { name: 'address', label: 'Alamat', type: 'textarea', max: 400, optional: true },
  { name: 'instagram_url', label: 'Tautan Instagram', type: 'url', max: 2048, optional: true },
  { name: 'tiktok_url', label: 'Tautan TikTok', type: 'url', max: 2048, optional: true },
  { name: 'facebook_url', label: 'Tautan Facebook', type: 'url', max: 2048, optional: true },
  { name: 'logo_url', label: 'Foto profil / logo', section: 'Tampilan beranda', type: 'image', uploadOnly: true },
  { name: 'cover_url', label: 'Foto sampul', type: 'image' },
  { name: 'background_url', label: 'Foto latar belakang', type: 'image' },
  { name: 'opens', label: 'Jam buka (WIB)', section: 'Reservasi', type: 'time' },
  { name: 'closes', label: 'Jam tutup (WIB)', type: 'time' },
  { name: 'interval', label: 'Interval slot (menit)', type: 'number', min: 5, max: 120, step: 5 },
  { name: 'max_days', label: 'Maksimal hari pemesanan ke depan', type: 'number', min: 0, max: 90 },
  { name: 'lead_minutes', label: 'Minimal waktu sebelum booking (menit)', type: 'number', min: 0, max: 10080 },
  { name: 'phone_required', label: 'Wajibkan nomor WhatsApp pelanggan', type: 'check' },
  { name: 'online_enabled', label: 'Terima reservasi online', type: 'check' },
  { name: 'confirm_notice', label: 'Pesan sebelum konfirmasi reservasi', type: 'textarea', max: 500, optional: true },
  { name: 'confirmation', label: 'Pesan setelah reservasi berhasil', type: 'textarea', max: 500, optional: true },
]
function dataValue(form: FormData, field: Field) {
  const value = String(form.get(field.name) ?? '')
  if (field.type === 'check') return form.has(field.name)
  if (field.type === 'time') return fromClock(value)
  return field.type === 'number' ? Number(value) : value
}
export function HourInput({ name, value, onChange }: { name?: string; value: string; onChange?: (value: string) => void }) {
  return <input name={name} required pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00" placeholder="08:00"
    {...(onChange ? { value, onChange: (event) => onChange(event.target.value) } : { defaultValue: value })} />
}
function Editor({ fields, schema, initial, onSave }: {
  fields: Field[]; schema: z.ZodType; initial: Record<string, unknown>; onSave: (value: unknown) => Promise<void>
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const admin = useAdminApi()
  const [images, setImages] = useState<Record<string, ImageEdit>>(() => Object.fromEntries(
    fields.filter((field) => field.type === 'image').map((field) => [field.name, { url: String(initial[field.name] ?? '') }]),
  ))
  const changeImage = (name: string, image: ImageEdit) => setImages((current) => ({ ...current, [name]: image }))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(fields.map((field) => {
      const image = images[field.name]
      return [field.name, image ? image.file ? '' : image.url.trim() : dataValue(form, field)]
    }))
    const result = schema.safeParse(values)
    if (!result.success) { setError(result.error.issues[0].message); return }
    setError(''); setPending(true)
    try {
      for (const [name, image] of Object.entries(images)) {
        if (!image.file) continue
        const uploaded = await admin.uploadImage(image.file)
        values[name] = uploaded.url
        changeImage(name, uploaded)
      }
      await onSave(schema.parse(values))
    }
    catch (err) { setError(errorText(err)) }
    finally { setPending(false) }
  }
  return <form className="fields admin-form" onSubmit={(event) => void submit(event)}>
    {fields.map((field) => {
      const value = initial[field.name]
      if (field.type === 'check') return <label className="field check-field" key={field.name}><input type="checkbox" name={field.name} defaultChecked={Boolean(value)} />{field.label}</label>
      return <Fragment key={field.name}>
        {field.section && <h2 className="wide editor-section">{field.section}</h2>}
        {field.type === 'image' ? <ImageField label={field.label} image={images[field.name]} disabled={pending} uploadOnly={field.uploadOnly}
          change={(image) => changeImage(field.name, image)} /> :
        <label className={'field ' + (field.type === 'textarea' ? 'wide' : '')}>{field.label}
        {field.type === 'textarea' ? <textarea name={field.name} defaultValue={String(value ?? '')} rows={3} maxLength={field.max} /> :
          field.type === 'time' ? <HourInput name={field.name} value={clock(Number(value))} /> :
          <input name={field.name} defaultValue={String(value ?? '')} type={field.type ?? 'text'} required={!field.optional} min={field.min}
            max={field.type === 'number' ? field.max : undefined} step={field.step}
            maxLength={field.type !== 'number' ? field.max : undefined} />}
        </label>}
      </Fragment>
    })}
    {error && <p className="message danger wide" role="alert">{error}</p>}
    <button className="button gold" disabled={pending}>{pending ? 'Menyimpan…' : 'Simpan'}</button>
  </form>
}
function detail(item: CatalogItem) {
  if ('price' in item) return rupiah(item.price) + ' · ' + item.duration_minutes + ' menit'
  if ('start_time' in item) return clock(item.start_time) + '–' + clock(item.end_time) + ' WIB'
  return item.description || 'Urutan tampil ' + item.sort_order
}
export function CatalogPage({ kind }: { kind: Kind }) {
  const config = configs[kind]
  const data = useAdminQuery<CatalogItem[]>('/' + kind)
  const admin = useAdminApi()
  const [edit, setEdit] = useState<CatalogItem | 'new' | null>(null)
  const [removal, setRemoval] = useState<CatalogItem | null>(null)
  const [deletion, setDeletion] = useState<CatalogItem | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function deactivate() {
    if (!removal) return
    setPending(true); setError('')
    try {
      await admin.request('/' + kind + '/' + removal.id, 'DELETE')
      setRemoval(null)
      await admin.saved('Data dinonaktifkan.')
    } catch (err) { setError(errorText(err)) }
    finally { setPending(false) }
  }
  return <div className="admin-stack">
    <header className="admin-heading section-row"><h1>{config.title}</h1>
      <button className="button gold" onClick={() => setEdit('new')}><Plus size={18} /> Tambah {config.singular}</button></header>
    {data.isPending ? <Loading /> : data.isError ? <Failure error={data.error} retry={() => void data.refetch()} /> :
      !data.data.length ? <Empty>Belum ada {config.singular}.</Empty> : <div className="admin-card">
      <ul className="data-list catalog-list">{data.data.map((item) => <li key={item.id}>
        <div className="item-info">{'photo_url' in item && <Avatar photo={item.photo_url} name={item.name} />}
          <div><div className="catalog-title"><strong>{item.name}</strong><span className={'badge ' + (item.is_active ? 'good' : '')}>
            {item.is_active ? 'Aktif' : 'Nonaktif'}</span></div><small>{detail(item)}</small></div></div>
        <div className="admin-actions record-actions">
          <button className="button outline" onClick={() => setEdit(item)}>Ubah</button>
          {item.is_active && <button className="button outline" onClick={() => { setError(''); setRemoval(item) }}>Nonaktifkan</button>}
          <button className="button outline danger-button" aria-label={'Hapus ' + item.name} onClick={() => setDeletion(item)}>
            <Trash2 size={16} aria-hidden="true" /> Hapus</button></div>
      </li>)}</ul></div>}
    {edit && <Modal title={(edit === 'new' ? 'Tambah ' : 'Ubah ') + config.singular} close={() => setEdit(null)}>
      <Editor fields={config.fields} schema={config.schema} initial={edit === 'new' ? config.initial : edit}
        onSave={async (value) => {
          await admin.request('/' + kind + (edit === 'new' ? '' : '/' + edit.id), edit === 'new' ? 'POST' : 'PATCH', value)
          setEdit(null)
          await admin.saved('Data berhasil disimpan.')
        }} />
    </Modal>}
    {removal && <Modal title={'Nonaktifkan ' + config.singular + '?'} close={() => setRemoval(null)}>
      <p>{removal.name} akan dinonaktifkan.</p>
      {error && <p className="message danger" role="alert">{error}</p>}
      <div className="admin-actions"><button className="button outline" onClick={() => setRemoval(null)}>Kembali</button>
        <button className="button outline danger-button" disabled={pending} onClick={() => void deactivate()}>Nonaktifkan</button></div>
    </Modal>}
    {deletion && <DeleteDialog path={'/' + kind + '/' + deletion.id + '?permanent=1'} title={'Hapus ' + config.singular + '?'}
      message={`${deletion.name} akan dihapus permanen jika tidak terhubung ke reservasi, jadwal, atau pola rotasi.`}
      success="Data berhasil dihapus." close={() => setDeletion(null)} />}
  </div>
}
export function SettingsPage() {
  const data = useAdminQuery<Settings>('/settings')
  const admin = useAdminApi()
  return <div className="admin-stack"><header className="admin-heading"><h1>Pengaturan</h1></header>
    {data.isPending ? <Loading /> : data.isError ? <Failure error={data.error} retry={() => void data.refetch()} /> :
      <div className="admin-card"><Editor key={JSON.stringify(data.data)} fields={businessFields} schema={settingsSchema} initial={data.data ?? defaults}
        onSave={async (value) => { await admin.request('/settings', 'PATCH', value); await admin.saved('Pengaturan berhasil disimpan.') }} /></div>}
  </div>
}
