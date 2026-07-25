import { Outlet, useNavigate } from 'react-router'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Building2, LogOut } from 'lucide-react'

export default function ClientLayout() {
  const { auth, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Building2 className="h-5 w-5" />
          <button className="font-semibold" onClick={() => navigate('/client')}>
            项目后台 · 客户中心
          </button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-slate-300">{auth?.account.username}</span>
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
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
