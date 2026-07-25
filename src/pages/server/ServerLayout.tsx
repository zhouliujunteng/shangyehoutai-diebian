import { Outlet, useNavigate, useLocation } from 'react-router'
import { useAuth } from '@/lib/auth'
import { ACCOUNT_TYPE_LABEL } from '@/lib/labels'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Building2, LogOut, LayoutDashboard, ClipboardCheck, MessageSquareReply, Users } from 'lucide-react'

export default function ServerLayout() {
  const { auth, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isSuper = auth?.account.account_type === 'super_admin'

  const menus = [
    { path: '/server', label: '项目总览', icon: LayoutDashboard, exact: true, superOnly: true },
    { path: '/server/review', label: '审核工作台', icon: ClipboardCheck, superOnly: false },
    { path: '/server/replies', label: '回复处理', icon: MessageSquareReply, superOnly: false },
    { path: '/server/accounts', label: '账号管理', icon: Users, superOnly: true },
  ].filter((m) => !m.superOnly || isSuper)

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Building2 className="h-5 w-5 shrink-0" />
          <span className="font-semibold whitespace-nowrap">项目后台 · 服务端</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-slate-300 sm:inline">{auth?.account.username}</span>
            <Badge variant="outline" className="border-slate-600 text-slate-300">
              {ACCOUNT_TYPE_LABEL[auth?.account.account_type ?? ''] ?? ''}
              {auth?.account.account_type === 'reviewer' && auth.account.reviewer_level
                ? ` ${auth.account.reviewer_level} 级`
                : ''}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={() => {
                logout()
                navigate('/login')
              }}
            >
              <LogOut className="mr-1 h-4 w-4" /> 退出
            </Button>
          </div>
        </div>
        <nav className="border-t border-slate-800">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
            {menus.map((m) => (
              <button
                key={m.path}
                onClick={() => navigate(m.path)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm transition-colors ${
                  isActive(m.path, m.exact)
                    ? 'border-b-2 border-white font-medium text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <m.icon className="h-4 w-4" />
                {m.label}
              </button>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
