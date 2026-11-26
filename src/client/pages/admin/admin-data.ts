import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import type { AdminUser } from '../../../shared/types.ts'
import { useToast } from '../../components/ui.tsx'
import { adminKey, api, errorText } from '../../lib/api.ts'

export const AdminContext = createContext<AdminUser | null>(null)
export function useAdminQuery<T>(path: string, enabled = true) {
  return useQuery({ queryKey: adminKey(path), queryFn: ({ signal }) => api<T>('/admin' + path, { signal }), enabled })
}
export function useAdminApi() {
  const user = useContext(AdminContext)
  if (!user) throw new Error('Admin context required')
  const client = useQueryClient()
  const toast = useToast()
  return {
    user,
    request<T>(path: string, method: string, body?: unknown, key?: string) {
      return api<T>('/admin' + path, { method, body, key, csrf: user.csrf })
    },
    async saved(message: string) {
      toast(message)
      await Promise.all([client.invalidateQueries({ queryKey: ['admin'] }), client.invalidateQueries({ queryKey: ['public'] })])
    },
    failed(error: unknown) { toast(errorText(error), 'error') },
  }
}
