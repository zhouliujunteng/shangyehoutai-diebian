import { Outlet, useNavigate } from 'react-router'
import { useAuth } from '@/lib/auth'
import { accountDisplayName } from '@/lib/types'
import { Button } from '@/components/ui/button'
import Beian from '@/components/Beian'
import { Building2, LogOut, Settings } from 'lucide-react'
import { APP_VERSION } from '@/lib/appVersion'

export default function ClientLayout() {
  const { auth, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Building2 className="h-5 w-5" />
          <button className="font-semibold" onClick={() => navigate('/client')}>
            项目后台 · 顾问工作台
          </button>
          <span className="text-xs text-slate-500">{APP_VERSION}</span>
          <div className="ml-auto flex items-center gap-3">
            <button
              className="text-sm text-slate-300 transition-colors hover:text-white"
              title="账号设置"
              onClick={() => navigate('/client/settings')}
            >
              {accountDisplayName(auth?.account)}
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={() => navigate('/client/settings')}
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
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Beian />
    </div>
  )
}
