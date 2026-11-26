import { useQuery } from '@tanstack/react-query'
import type { BarberWork, Service, Settings } from '../../../shared/types.ts'
import { api, publicKey } from '../../lib/api.ts'

export const useSettings = () => useQuery({ queryKey: publicKey('settings'), queryFn: ({ signal }) => api<Settings>('/public/settings', { signal }) })
export const useServices = () => useQuery({ queryKey: publicKey('services'), queryFn: ({ signal }) => api<Service[]>('/public/services', { signal }) })
export const useBarbers = () => useQuery({ queryKey: publicKey('barbers'), queryFn: ({ signal }) => api<BarberWork[]>('/public/barbers', { signal }) })
