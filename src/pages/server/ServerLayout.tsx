import { Outlet, useNavigate, useLocation } from 'react-router'
import { useAuth } from '@/lib/auth'
import { ACCOUNT_TYPE_LABEL } from '@/lib/labels'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Beian from '@/components/Beian'
import { Building2, LogOut, LayoutDashboard, ClipboardCheck, MessageSquareReply, Users, Settings } from 'lucide-react'
import { accountDisplayName } from '@/lib/types'
import { APP_VERSION } from '@/lib/appVersion'

export default function ServerLayout() {
  const { auth, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isSuper = auth?.account.account_type === 'super_admin'
  // 一级审核员与超管一样：可查看项目总览并进行审核分配（开发文档 §2.1/§2.3）
  const isL1Reviewer = auth?.account.account_type === 'reviewer' && auth?.account.reviewer_level === 1

  const menus = [
    { path: '/server', label: '项目总览', icon: LayoutDashboard, exact: true, show: isSuper || isL1Reviewer },
    { path: '/server/review', label: '审核工作台', icon: ClipboardCheck, show: true },
    { path: '/server/replies', label: '反馈处理', icon: MessageSquareReply, show: true },
    { path: '/server/accounts', label: '账号管理', icon: Users, show: isSuper },
  ].filter((m) => m.show)

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path)

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Building2 className="h-5 w-5 shrink-0" />
          <span className="font-semibold whitespace-nowrap">项目后台 · 服务端</span>
          <span className="text-xs text-slate-500">{APP_VERSION}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="hidden text-sm text-slate-300 transition-colors hover:text-white sm:inline"
              title="账号设置"
              onClick={() => navigate('/server/settings')}
            >
              {accountDisplayName(auth?.account)}
            </button>
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
              onClick={() => navigate('/server/settings')}
              title="账号设置"
            >
              <Settings className="h-4 w-4" />
            </Button>
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
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Beian />
    </div>
  )
}
