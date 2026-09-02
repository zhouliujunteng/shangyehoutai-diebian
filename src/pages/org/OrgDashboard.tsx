import { useEffect, useState, type FormEvent } from 'react'
import { gql } from '@/lib/graphql'
import { useAuth } from '@/lib/auth'
import { accountDisplayName, type Account } from '@/lib/types'
import { ACCOUNT_TYPE_LABEL } from '@/lib/labels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { KeyRound, Loader2, RefreshCw, UserPlus, Users } from 'lucide-react'

/**
 * 机构管理端（客户端总管理账号，如盛世蝶变）：
 * 开本机构的客户/顾问账号、配额池分配（客户默认 1、顾问默认 0，从机构总配额扣）、
 * 设置客户→顾问的自动分配（默认顾问），机构只管账号、不建项目。
 */
export default function OrgDashboard() {
  const { auth, refreshAccount } = useAuth()
  const [members, setMembers] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  // 新建表单
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [type, setType] = useState<'customer' | 'client'>('customer')
  const [quota, setQuota] = useState('1')
  const [creating, setCreating] = useState(false)

  const myId = Number(auth!.account.id)
  const pool = auth?.account.project_quota ?? 0
  const allocated = members.reduce((s, m) => s + (m.project_quota ?? 0), 0)
  const remaining = pool > 0 ? pool - allocated : Infinity
  const consultants = members.filter((m) => m.account_type === 'client')
  const defaultConsultant = auth?.account.default_consultant_id ?? null

  const load = async () => {
    setLoading(true)
    try {
      await refreshAccount()
      const data = await gql<{ account: Account[] }>(
        `query($oid: bigint!) {
          account(where: { org_id: { _eq: $oid } }, order_by: { id: asc }) {
            id username nickname account_type project_quota status consultant_id
          }
        }`,
        { oid: myId },
      )
      setMembers(data.account.filter((a) => a.username))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const genPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const arr = crypto.getRandomValues(new Uint32Array(10))
    setPassword(Array.from(arr).map((v) => chars[v % chars.length]).join('') + '@1')
  }

  const onCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      toast.error('请输入用户名和初始密码')
      return
    }
    const q = Number(quota) || 0
    if (q < 0 || (pool > 0 && q > remaining)) {
      toast.error(`配额超出剩余可用额度（剩 ${remaining === Infinity ? '不限' : remaining}）`)
      return
    }
    setCreating(true)
    try {
      // 1. 注册（必须匿名调用）
      const reg = await gql<{ authenticateWithUsername: { account: { id: number | string } } | null }>(
        `mutation($username: String!, $password: String!) {
          authenticateWithUsername(username: $username, password: $password, register: true) { account { id } }
        }`,
        { username: username.trim(), password },
        false,
      )
      const newId = reg.authenticateWithUsername?.account?.id
      if (!newId) throw new Error('账号创建失败，可能用户名已存在')
      // 2. 设置类型/配额/所属机构；客户自动认领到默认顾问
      await gql(
        `mutation($id: bigint!, $set: account_set_input!) {
          update_account_by_pk(pk_columns: { id: $id }, _set: $set) { id }
        }`,
        {
          id: newId,
          set: {
            account_type: type,
            project_quota: q,
            org_id: myId,
            status: 'active',
            consultant_id: type === 'customer' ? defaultConsultant : null,
          },
        },
      )
      toast.success(
        `账号 ${username.trim()} 创建成功${type === 'customer' && defaultConsultant ? '，已自动分配给默认顾问' : ''}`,
      )
      setDialogOpen(false)
      setUsername('')
      setPassword('')
      setType('customer')
      setQuota('1')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  // 调整成员配额（从机构配额池扣减/回收）
  const changeQuota = async (m: Account, delta: number) => {
    const cur = m.project_quota ?? 0
    const next = cur + delta
    if (next < 0) return
    if (pool > 0 && delta > 0 && delta > remaining) {
      toast.error(`配额池剩余不足（剩 ${remaining}）`)
      return
    }
    setActing(`q-${m.id}`)
    try {
      await gql(
        `mutation($id: bigint!, $q: bigint!) { update_account_by_pk(pk_columns: { id: $id }, _set: { project_quota: $q }) { id } }`,
        { id: m.id, q: next },
      )
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  // 调整客户的认领顾问
  const assignConsultant = async (m: Account, cid: string) => {
    setActing(`a-${m.id}`)
    try {
      await gql(
        `mutation($id: bigint!, $cid: bigint) { update_account_by_pk(pk_columns: { id: $id }, _set: { consultant_id: $cid }) { id } }`,
        { id: m.id, cid: cid === 'none' ? null : Number(cid) },
      )
      toast.success('分配已更新')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  // 设置默认顾问（自动分配机制）
  const setDefault = async (cid: string) => {
    setActing('default')
    try {
      await gql(
        `mutation($id: bigint!, $cid: bigint) { update_account_by_pk(pk_columns: { id: $id }, _set: { default_consultant_id: $cid }) { id } }`,
        { id: myId, cid: cid === 'none' ? null : Number(cid) },
      )
      toast.success(cid === 'none' ? '已关闭自动分配' : '已设置默认顾问，新客户将自动分配给他')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置失败')
    } finally {
      setActing(null)
    }
  }

  const toggleStatus = async (m: Account) => {
    const next = m.status === 'active' ? 'disabled' : 'active'
    setActing(`s-${m.id}`)
    try {
      await gql(
        `mutation($id: bigint!, $st: String!) { update_account_by_pk(pk_columns: { id: $id }, _set: { status: $st }) { id } }`,
        { id: m.id, st: next },
      )
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  const quotaCell = (m: Account) => (
    <span className="inline-flex items-center gap-1">
      <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={acting === `q-${m.id}` || (m.project_quota ?? 0) <= 0} onClick={() => changeQuota(m, -1)}>-</Button>
      <span className="w-8 text-center">{m.project_quota ?? 0}</span>
      <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={acting === `q-${m.id}` || (pool > 0 && remaining <= 0)} onClick={() => changeQuota(m, 1)}>+</Button>
    </span>
  )

  return (
    <div className="space-y-6">
      {/* 配额池 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">配额池</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-4">
            <Progress value={pool > 0 ? Math.min(100, (allocated / pool) * 100) : 0} className="h-2 flex-1" />
            <span className="whitespace-nowrap text-sm text-slate-600">
              已分配 {allocated} / 总配额 {pool > 0 ? pool : '不限'}
            </span>
          </div>
          <p className="text-xs text-slate-400">客户账号默认 1 个配额，顾问默认 0；给成员加配额从总配额里扣，减配额自动回收。</p>
        </CardContent>
      </Card>

      {/* 自动分配设置 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">客户自动分配</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600">新建客户账号自动分配给：</span>
          <Select value={defaultConsultant ? String(defaultConsultant) : 'none'} onValueChange={setDefault} disabled={acting === 'default'}>
            <SelectTrigger className="w-52 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不自动分配（稍后手动分）</SelectItem>
              {consultants.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{accountDisplayName(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {consultants.length === 0 && <span className="text-xs text-amber-600">还没有顾问账号，先创建一个顾问</span>}
        </CardContent>
      </Card>

      {/* 成员管理 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" /> 成员账号（{members.length}）
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={load} title="刷新">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" className="bg-slate-900 hover:bg-slate-800" onClick={() => setDialogOpen(true)}>
                <UserPlus className="mr-1.5 h-4 w-4" /> 新建账号
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12 text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
            </div>
          ) : members.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">还没有成员账号，点「新建账号」给客户和顾问开号</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>账号</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>配额</TableHead>
                  <TableHead>分配顾问</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {accountDisplayName(m)}
                      {m.nickname?.trim() ? <span className="ml-1.5 text-xs text-slate-400">{m.username}</span> : null}
                    </TableCell>
                    <TableCell>{ACCOUNT_TYPE_LABEL[m.account_type] ?? m.account_type}</TableCell>
                    <TableCell>{quotaCell(m)}</TableCell>
                    <TableCell>
                      {m.account_type === 'customer' ? (
                        <Select
                          value={m.consultant_id ? String(m.consultant_id) : 'none'}
                          onValueChange={(v) => assignConsultant(m, v)}
                          disabled={acting === `a-${m.id}`}
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">未分配</SelectItem>
                            {consultants.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>{accountDisplayName(c)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={m.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                        {m.status === 'active' ? '正常' : '已停用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="h-7" disabled={acting === `s-${m.id}`} onClick={() => toggleStatus(m)}>
                        {m.status === 'active' ? '停用' : '启用'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 新建账号 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建成员账号</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="建议用姓名拼音或手机号" />
            </div>
            <div className="space-y-2">
              <Label>初始密码</Label>
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="初始密码" />
                <Button type="button" variant="outline" onClick={genPassword}>
                  <KeyRound className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>账号类型</Label>
              <Select value={type} onValueChange={(v) => { const t = v as 'customer' | 'client'; setType(t); setQuota(t === 'customer' ? '1' : '0') }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">客户（企业主本人）</SelectItem>
                  <SelectItem value="client">顾问</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>配额</Label>
              <Input type="number" min={0} value={quota} onChange={(e) => setQuota(e.target.value)} />
              <p className="text-xs text-slate-400">
                客户默认 1，顾问默认 0；从配额池剩余额度扣除（剩 {remaining === Infinity ? '不限' : remaining}）
              </p>
            </div>
            {type === 'customer' && (
              <p className="text-xs text-slate-400">
                {defaultConsultant ? '创建后自动分配给默认顾问' : '未设置默认顾问，创建后可在成员列表手动分配'}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
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
