import { useEffect, useRef, useState, type FormEvent } from 'react'
import { gql, invokeActionFlow, ACCOUNT_ADMIN_FLOW_ID } from '@/lib/graphql'
import { useAuth } from '@/lib/auth'
import { ACCOUNT_TYPE_LABEL } from '@/lib/labels'
import type { Account } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, UserPlus, Ban, CircleCheck, Pencil, Search, KeyRound, ClipboardCopy } from 'lucide-react'

interface AccountRow extends Account {
  created_at?: string
}

export default function Accounts() {
  const { auth } = useAuth()
  const [list, setList] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  // 新建表单
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [type, setType] = useState<'client' | 'reviewer'>('client')
  const [level, setLevel] = useState('3')
  const [quota, setQuota] = useState('1')
  const [creating, setCreating] = useState(false)

  const kw = search.trim().toLowerCase()
  const visibleList = list.filter((a) => {
    if (typeFilter !== 'all' && a.account_type !== typeFilter) return false
    if (kw && !a.username.toLowerCase().includes(kw)) return false
    return true
  })

  // 配额行内编辑（仅超管）
  const isSuperAdmin = auth?.account.account_type === 'super_admin'
  const [editingQuotaId, setEditingQuotaId] = useState<string | null>(null)
  const [quotaDraft, setQuotaDraft] = useState('')
  const [savingQuota, setSavingQuota] = useState(false)
  const quotaCancelRef = useRef(false)

  const saveQuota = async (a: AccountRow) => {
    if (quotaCancelRef.current) {
      quotaCancelRef.current = false
      setEditingQuotaId(null)
      return
    }
    const n = Number(quotaDraft)
    if (!Number.isInteger(n) || n < 0) {
      toast.error('配额需为不小于 0 的整数（0 表示不限制）')
      return
    }
    if (n === (a.project_quota ?? 0)) {
      setEditingQuotaId(null)
      return
    }
    setSavingQuota(true)
    try {
      await gql(
        `mutation($id: bigint!, $q: bigint!) {
          update_account_by_pk(pk_columns: { id: $id }, _set: { project_quota: $q }) { id }
        }`,
        { id: a.id, q: n },
      )
      toast.success(`已将 ${a.username} 的项目配额调整为 ${n === 0 ? '不限' : n}`)
      setEditingQuotaId(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingQuota(false)
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await gql<{ account: AccountRow[] }>(
        `query {
          account(order_by: { id: asc }) {
            id username nickname account_type reviewer_level project_quota status
          }
        }`,
      )
      setList(data.account.filter((a) => a.username))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      toast.error('请输入用户名和初始密码')
      return
    }
    setCreating(true)
    try {
      // 1. 通过注册接口创建账号（必须匿名调用：带当前登录态会被拒绝 "You are already logged in"）
      const reg = await gql<{ authenticateWithUsername: { account: { id: number | string } } | null }>(
        `mutation($username: String!, $password: String!) {
          authenticateWithUsername(username: $username, password: $password, register: true) {
            account { id }
          }
        }`,
        { username: username.trim(), password },
        false,
      )
      const newId = reg.authenticateWithUsername?.account?.id
      if (!newId) throw new Error('账号创建失败，可能用户名已存在')
      // 2. 设置自定义字段
      await gql(
        `mutation($id: bigint!, $set: account_set_input!) {
          update_account_by_pk(pk_columns: { id: $id }, _set: $set) { id }
        }`,
        {
          id: newId,
          set: {
            account_type: type,
            reviewer_level: type === 'reviewer' ? Number(level) : null,
            project_quota: type === 'client' ? Number(quota) || 0 : 0,
            status: 'active',
          },
        },
      )
      // 3. 审核员账号：通过行为流绑定「服务端」角色（否则登录后无审核相关数据权限）
      if (type === 'reviewer') {
        await invokeActionFlow(ACCOUNT_ADMIN_FLOW_ID, { accountId: Number(newId) })
      }
      toast.success(`账号 ${username.trim()} 创建成功${type === 'reviewer' ? '，服务端角色已绑定' : ''}`)
      setDialogOpen(false)
      setUsername('')
      setPassword('')
      setType('client')
      setLevel('3')
      setQuota('1')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  // 修改审核员等级（仅超管）
  const changeLevel = async (a: AccountRow, lv: string) => {
    if (Number(lv) === (a.reviewer_level ?? 0)) return
    setActing(`lv-${a.id}`)
    try {
      await gql(
        `mutation($id: bigint!, $lv: bigint!) {
          update_account_by_pk(pk_columns: { id: $id }, _set: { reviewer_level: $lv }) { id }
        }`,
        { id: a.id, lv: Number(lv) },
      )
      toast.success(`已将 ${a.username} 的审核级别调整为 ${lv} 级`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setActing(null)
    }
  }

  // 生成 14 位强密码（大小写+数字+符号，排除易混淆字符）
  const genStrongPassword = () => {
    const pick = (s: string, n: number) =>
      Array.from(crypto.getRandomValues(new Uint32Array(n)))
        .map((v) => s[v % s.length])
        .join('')
    const pwd =
      pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 2) +
      pick('abcdefghjkmnpqrstuvwxyz', 4) +
      pick('23456789', 3) +
      pick('!@#$%&*?', 2) +
      pick('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', 3)
    const arr = pwd.split('')
    const rnd = crypto.getRandomValues(new Uint32Array(arr.length))
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rnd[i] % (i + 1)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    setPassword(arr.join(''))
  }

  // 一键复制账号+密码，直接发给对方
  const copyAccountInfo = async () => {
    const text = `账号：${username.trim()}\n初始密码：${password}\n登录后请先在「账号设置」中绑定手机号并修改密码。`
    try {
      await navigator.clipboard.writeText(text)
      toast.success('账号和密码已复制，可直接发送给对方')
    } catch {
      toast.error('复制失败')
    }
  }

  const toggleStatus = async (a: AccountRow) => {
    const next = a.status === 'active' ? 'disabled' : 'active'
    setActing(String(a.id))
    try {
      await gql(
        `mutation($id: bigint!, $st: String!) {
          update_account_by_pk(pk_columns: { id: $id }, _set: { status: $st }) { id }
        }`,
        { id: a.id, st: next },
      )
      toast.success(next === 'disabled' ? `已停用 ${a.username}` : `已启用 ${a.username}`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  /* 手机端账号卡片：竖排展示，无需横向滑动 */
  const accountCard = (a: AccountRow) => {
    const isSelf = String(a.id) === String(auth?.account.id)
    return (
      <Card key={a.id}>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">
                {a.nickname?.trim() || a.username}
                {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">（我）</span>}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {ACCOUNT_TYPE_LABEL[a.account_type] ?? a.account_type}
                {a.nickname?.trim() ? ` · ${a.username}` : ''}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                a.status === 'active'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }
            >
              {a.status === 'active' ? '正常' : '已停用'}
            </Badge>
          </div>
          {a.account_type === 'reviewer' && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-500">审核级别</span>
              {isSuperAdmin && !isSelf ? (
                <Select
                  value={String(a.reviewer_level ?? 3)}
                  onValueChange={(v) => changeLevel(a, v)}
                  disabled={acting === `lv-${a.id}`}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 级（初审）</SelectItem>
                    <SelectItem value="2">2 级（复审）</SelectItem>
                    <SelectItem value="1">1 级（终审）</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span>{a.reviewer_level ? `${a.reviewer_level} 级` : '—'}</span>
              )}
            </div>
          )}
          {a.account_type === 'client' && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-500">项目配额</span>
              <span>{a.project_quota || '不限'}</span>
            </div>
          )}
          {a.account_type !== 'super_admin' && !isSelf && (
            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button
                size="sm"
                variant="outline"
                className={
                  a.status === 'active'
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-green-200 text-green-600 hover:bg-green-50'
                }
                disabled={acting === String(a.id)}
                onClick={() => toggleStatus(a)}
              >
                {acting === String(a.id) ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : a.status === 'active' ? (
                  <Ban className="mr-1 h-4 w-4" />
                ) : (
                  <CircleCheck className="mr-1 h-4 w-4" />
                )}
                {a.status === 'active' ? '停用' : '启用'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-900">账号管理（{visibleList.length}）</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="w-44 pl-9"
              placeholder="搜索用户名…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="client">客户</SelectItem>
              <SelectItem value="reviewer">审核员</SelectItem>
              <SelectItem value="super_admin">超级管理员</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => setDialogOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" /> 新建账号
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 手机端：竖排卡片 */}
          <div className="space-y-3 sm:hidden">{visibleList.map((a) => accountCard(a))}</div>
          {/* 平板/桌面：表格 */}
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户名</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>审核级别</TableHead>
                    <TableHead>项目配额</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleList.map((a) => {
                    const isSelf = String(a.id) === String(auth?.account.id)
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.username}
                          {isSelf && <span className="ml-1.5 text-xs text-slate-400">（我）</span>}
                        </TableCell>
                        <TableCell>{ACCOUNT_TYPE_LABEL[a.account_type] ?? a.account_type}</TableCell>
                        <TableCell>
                          {a.account_type !== 'reviewer' ? (
                            '—'
                          ) : isSuperAdmin && !isSelf ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Select
                                value={String(a.reviewer_level ?? 3)}
                                onValueChange={(v) => changeLevel(a, v)}
                                disabled={acting === `lv-${a.id}`}
                              >
                                <SelectTrigger className="h-8 w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="3">3 级（初审）</SelectItem>
                                  <SelectItem value="2">2 级（复审）</SelectItem>
                                  <SelectItem value="1">1 级（终审）</SelectItem>
                                </SelectContent>
                              </Select>
                              {acting === `lv-${a.id}` && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                            </span>
                          ) : a.reviewer_level ? (
                            `${a.reviewer_level} 级`
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {a.account_type !== 'client' ? (
                            '—'
                          ) : isSuperAdmin && editingQuotaId === String(a.id) ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Input
                                type="number"
                                min={0}
                                className="h-8 w-24"
                                autoFocus
                                value={quotaDraft}
                                disabled={savingQuota}
                                onChange={(e) => setQuotaDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur()
                                  if (e.key === 'Escape') {
                                    quotaCancelRef.current = true
                                    e.currentTarget.blur()
                                  }
                                }}
                                onBlur={() => saveQuota(a)}
                              />
                              {savingQuota && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={
                                isSuperAdmin
                                  ? 'inline-flex -ml-1.5 items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-100'
                                  : ''
                              }
                              title={isSuperAdmin ? '点击修改配额' : undefined}
                              onClick={() => {
                                if (!isSuperAdmin) return
                                setEditingQuotaId(String(a.id))
                                setQuotaDraft(String(a.project_quota ?? 0))
                              }}
                            >
                              {a.project_quota || '不限'}
                              {isSuperAdmin && <Pencil className="h-3 w-3 text-slate-300" />}
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              a.status === 'active'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }
                          >
                            {a.status === 'active' ? '正常' : '已停用'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {a.account_type !== 'super_admin' && !isSelf && (
                            <Button
                              size="sm"
                              variant="outline"
                              className={
                                a.status === 'active'
                                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                                  : 'border-green-200 text-green-600 hover:bg-green-50'
                              }
                              disabled={acting === String(a.id)}
                              onClick={() => toggleStatus(a)}
                            >
                              {acting === String(a.id) ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                              ) : a.status === 'active' ? (
                                <Ban className="mr-1 h-4 w-4" />
                              ) : (
                                <CircleCheck className="mr-1 h-4 w-4" />
                              )}
                              {a.status === 'active' ? '停用' : '启用'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建账号</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="登录用户名" />
            </div>
            <div className="space-y-2">
              <Label>初始密码</Label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="建议设置强密码并告知用户修改" />
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={genStrongPassword}>
                  <KeyRound className="mr-1 h-3.5 w-3.5" /> 生成强密码
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!username.trim() || !password}
                  onClick={copyAccountInfo}
                  title="复制「账号+密码」，直接粘贴发送给对方"
                >
                  <ClipboardCopy className="mr-1 h-3.5 w-3.5" /> 复制账号密码
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>账号类型</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'client' | 'reviewer')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">客户（客户服务账号）</SelectItem>
                  <SelectItem value="reviewer">审核员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === 'reviewer' && (
              <div className="space-y-2">
                <Label>审核级别</Label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 级（初审）</SelectItem>
                    <SelectItem value="2">2 级（复审）</SelectItem>
                    <SelectItem value="1">1 级（终审）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {type === 'client' && (
              <div className="space-y-2">
                <Label>项目配额</Label>
                <Input type="number" min={0} value={quota} onChange={(e) => setQuota(e.target.value)} />
                <p className="text-xs text-slate-400">该客户可创建的项目数量上限，0 表示不限制</p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" className="bg-slate-900 hover:bg-slate-800" disabled={creating}>
                {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                创建账号
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
