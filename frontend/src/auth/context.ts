import { createContext } from 'react'
import type { User } from '@/lib/types'

export interface AuthState {
  user: User | null
  /** True while a stored token is being checked on first load. */
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: { email: string; full_name: string; password: string }) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthState | null>(null)
