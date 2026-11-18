import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '@/lib/api'
import { keys } from '@/lib/queries'
import { AuthContext, type AuthState } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState(() => tokenStore.get())

  const me = useQuery({
    queryKey: keys.me,
    queryFn: api.me,
    enabled: token !== null,
    retry: false,
    staleTime: 5 * 60_000,
  })

  const logout = useCallback(() => {
    tokenStore.clear()
    setToken(null)
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.login(email, password)
      tokenStore.set(result.access_token)
      queryClient.clear()
      const user = await api.me()
      queryClient.setQueryData(keys.me, user)
      setToken(result.access_token)
    },
    [queryClient],
  )

  const register = useCallback(
    async (input: { email: string; full_name: string; password: string }) => {
      await api.register(input)
      await login(input.email, input.password)
    },
    [login],
  )

  const value = useMemo<AuthState>(
    () => ({
      user: token ? (me.data ?? null) : null,
      loading: token !== null && me.isPending,
      login,
      register,
      logout,
    }),
    [token, me.data, me.isPending, login, register, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
