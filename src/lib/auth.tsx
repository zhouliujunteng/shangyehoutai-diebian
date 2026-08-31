import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { gql } from './graphql'
import type { Account, AccountType } from './types'

const AUTH_KEY = 'xa_auth'

interface AuthState {
  token: string
  account: Account
}

interface AuthContextValue {
  auth: AuthState | null
  loading: boolean
  login: (username: string, password: string) => Promise<Account>
  logout: () => void
  refreshAccount: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  auth: null,
  loading: true,
  login: async () => {
    throw new Error('not ready')
  },
  logout: () => {},
  refreshAccount: async () => {},
})

function readStored(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.token || !parsed?.account) return null
    return parsed as AuthState
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setAuth(readStored())
    setLoading(false)
  }, [])

  const login = async (username: string, password: string): Promise<Account> => {
    const data = await gql<{
      authenticateWithUsername: { account: { id: number | string }; jwt: { token: string } } | null
    }>(
      `mutation($username: String!, $password: String!) {
        authenticateWithUsername(username: $username, password: $password, register: false) {
          account { id permissionRoles }
          jwt { token }
        }
      }`,
      { username, password },
      false,
    )
    const payload = data.authenticateWithUsername
    if (!payload?.jwt?.token) throw new Error('用户名或密码错误')
    const token = payload.jwt.token

    // 登录成功后查询账号完整信息
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, account: { id: payload.account.id } }))
    const detail = await gql<{ account_by_pk: Account | null }>(
      `query($id: bigint!) {
        account_by_pk(id: $id) { id username nickname fz_phone_number account_type reviewer_level project_quota status consultant_id }
      }`,
      { id: payload.account.id },
    )
    const account = detail.account_by_pk
    if (!account) throw new Error('账号信息读取失败')
    if (account.status === 'disabled') {
      localStorage.removeItem(AUTH_KEY)
      throw new Error('该账号已被停用，请联系超级管理员')
    }
    const state = { token, account }
    localStorage.setItem(AUTH_KEY, JSON.stringify(state))
    setAuth(state)
    return account
  }

  const logout = () => {
    localStorage.removeItem(AUTH_KEY)
    setAuth(null)
  }

  const refreshAccount = async () => {
    const stored = readStored()
    if (!stored) return
    const detail = await gql<{ account_by_pk: Account | null }>(
      `query($id: bigint!) {
        account_by_pk(id: $id) { id username nickname fz_phone_number account_type reviewer_level project_quota status consultant_id }
      }`,
      { id: stored.account.id },
    )
    if (detail.account_by_pk) {
      const state = { token: stored.token, account: detail.account_by_pk }
      localStorage.setItem(AUTH_KEY, JSON.stringify(state))
      setAuth(state)
    }
  }

  return (
    <AuthContext.Provider value={{ auth, loading, login, logout, refreshAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

/** 各角色登录后的首页：客户（企业主）→ /customer；顾问 → /client；其余 → /server */
export function homeFor(accountType: AccountType): string {
  if (accountType === 'customer') return '/customer'
  if (accountType === 'client') return '/client'
  return '/server'
}

/** 路由守卫：未登录跳登录页；角色不符跳对应首页 */
export function RequireAuth({ roles, children }: { roles: AccountType[]; children: ReactNode }) {
  const { auth, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">加载中…</div>
  }
  if (!auth) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  if (auth.account.status === 'disabled') {
    return <Navigate to="/login" replace />
  }
  if (!roles.includes(auth.account.account_type)) {
    return <Navigate to={homeFor(auth.account.account_type)} replace />
  }
  return <>{children}</>
}

/** 当前用户的审核级别：超管视为 1 级（终审） */
export function myReviewLevel(account: Account | null | undefined): number {
  if (!account) return 0
  if (account.account_type === 'super_admin') return 1
  return account.reviewer_level ?? 0
}

/** 该级别对应的待审核状态 */
export function pendingStatusForLevel(level: number): string {
  return `pending_l${level}`
}
