import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Beian from '@/components/Beian'
import { toast } from 'sonner'
import { Building2, Loader2 } from 'lucide-react'

export default function Login() {
  const { login, auth } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 已登录则直接跳对应首页
  if (auth) {
    const home = auth.account.account_type === 'client' ? '/client' : '/server'
    return <Navigate to={home} replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      toast.error('请输入账号和密码')
      return
    }
    setSubmitting(true)
    try {
      const account = await login(username.trim(), password)
      toast.success(`欢迎，${account.username}`)
      const from = (location.state as { from?: string } | null)?.from
      const home = account.account_type === 'client' ? '/client' : '/server'
      navigate(from && from !== '/login' ? from : home, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Building2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">项目后台</CardTitle>
          <CardDescription>企业咨询服务平台 · 统一登录入口</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">账号</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入账号"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              登 录
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
                onClick={() => toast.info('请联系超级管理员重置密码')}
              >
                忘记密码？
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Beian />
    </div>
  )
}
