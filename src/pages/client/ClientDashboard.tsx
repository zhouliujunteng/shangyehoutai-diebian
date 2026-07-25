import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { gql, logOperation } from '@/lib/graphql'
import { useAuth } from '@/lib/auth'
import { formatTime, randomToken, plusDaysISO, CLIENT_PROJECT_STATUS_LABEL } from '@/lib/labels'
import { projectDisplayName, type Project } from '@/lib/types'
import { ClientProjectStatusBadge as ProjectStatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { FolderPlus, Loader2, ArrowRight, Search } from 'lucide-react'

export default function ClientDashboard() {
  const { auth, refreshAccount } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [remark, setRemark] = useState('')
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const quota = auth?.account.project_quota ?? 0
  const used = projects.length
  const quotaFull = quota > 0 && used >= quota

  const visibleProjects = projects.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    const kw = search.trim().toLowerCase()
    if (kw && !(p.name.toLowerCase().includes(kw) || (p.remark ?? '').toLowerCase().includes(kw))) return false
    return true
  })

  const load = async () => {
    setLoading(true)
    try {
      await refreshAccount()
      const data = await gql<{ project: Project[] }>(
        `query($uid: bigint!) {
          project(where: { owner_id: { _eq: $uid } }, order_by: { id: desc }) {
            id name remark status review_level created_at
          }
        }`,
        { uid: auth!.account.id },
      )
      setProjects(data.project)
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

  const onCreate = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const data = await gql<{ insert_project_one: { id: number } }>(
        `mutation($obj: project_insert_input!) {
          insert_project_one(object: $obj) { id }
        }`,
        {
          obj: {
            // 项目名称留空，待填写人提交收集表后自动回填（企业名称/公司全称）
            name: '',
            remark: remark.trim() || null,
            owner_id: auth!.account.id,
            status: 'created',
            review_level: null,
          },
        },
      )
      const pid = data.insert_project_one.id
      await gql(
        `mutation($obj: collect_link_insert_input!) {
          insert_collect_link_one(object: $obj) { id }
        }`,
        { obj: { project_id: pid, token: randomToken(), expires_at: plusDaysISO(3), status: 'active' } },
      )
      await logOperation({
        projectId: pid,
        operator: auth!.account.username,
        action: '创建项目并签发收集链接',
        targetType: 'project',
        targetId: pid,
        detail: { remark: remark.trim() || null },
      })
      toast.success('项目创建成功，收集链接已签发（3 天有效）')
      setDialogOpen(false)
      setRemark('')
      navigate(`/client/project/${pid}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 配额用量 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">项目配额</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={quota > 0 ? Math.min(100, (used / quota) * 100) : 0} className="h-2 flex-1" />
            <span className="text-sm text-slate-600 whitespace-nowrap">
              已用 {used} / {quota > 0 ? quota : '不限'}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">我的项目</h2>
        <Button
          className="bg-slate-900 hover:bg-slate-800"
          disabled={quotaFull}
          onClick={() => setDialogOpen(true)}
          title={quotaFull ? '已达配额上限' : undefined}
        >
          <FolderPlus className="mr-1.5 h-4 w-4" /> 新建项目
        </Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="搜索项目名称或备注…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-white">
            <SelectValue placeholder="按状态筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(CLIENT_PROJECT_STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {quotaFull && (
        <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          项目配额已用完（{used}/{quota}），如需更多配额请联系平台管理员。
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-400">
          {projects.length === 0 ? '暂无项目，点击右上角「新建项目」开始' : '没有符合条件的项目'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/client/project/${p.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-6">{projectDisplayName(p)}</CardTitle>
                  <ProjectStatusBadge status={p.status} />
                </div>
                {p.remark && p.name.trim() && <p className="text-xs text-slate-400">备注：{p.remark}</p>}
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm text-slate-500">
                <span>创建于 {formatTime(p.created_at)}</span>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="premark">备注（选填）</Label>
              <Input
                id="premark"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="仅自己可见，如：王总介绍的餐饮企业"
              />
            </div>
            <p className="text-xs text-slate-400">
              创建后将自动签发 3 天有效的收集链接，发送给企业填写人即可；项目名称将在企业填写后自动更新为企业名称。
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" className="bg-slate-900 hover:bg-slate-800" disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                创建
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
