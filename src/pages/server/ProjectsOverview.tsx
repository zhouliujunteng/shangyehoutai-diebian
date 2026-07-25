import { useEffect, useState, type FormEvent } from 'react'
import { gql, logOperation } from '@/lib/graphql'
import { useAuth } from '@/lib/auth'
import { formatTime, PROJECT_STATUS_LABEL } from '@/lib/labels'
import type { Project, ReviewAssignment } from '@/lib/types'
import { hasUnseenServerActivity, serverActivityAt, groupIndex, PROJECT_STATUS_GROUP_ORDER, type ServerProjectExtra } from '@/lib/projectMeta'
import { ProjectStatusBadge } from '@/components/StatusBadge'
import UpdateDot from '@/components/UpdateDot'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Settings2, Plus, Trash2, Search, LayoutGrid, List } from 'lucide-react'

interface ProjectRow extends Project, ServerProjectExtra {
  owner?: { username: string } | null
  review_assignments: ReviewAssignment[]
}

type ViewMode = 'card' | 'list'
const VIEW_MODE_KEY = 'serverProjectViewMode'

function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY)
    return v === 'card' ? 'card' : 'list'
  } catch {
    return 'list'
  }
}

export default function ProjectsOverview() {
  const { auth } = useAuth()
  // 超管与一级审核员可进行审核分配（开发文档 §2.3）
  const canManage = auth?.account.account_type === 'super_admin' || auth?.account.reviewer_level === 1
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [manageTarget, setManageTarget] = useState<ProjectRow | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)

  // 已读标记按账号隔离，避免同浏览器不同账号互相清除红点
  const viewedScope = `server:${auth?.account.username ?? ''}`

  const switchViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  const visibleProjects = projects
    .filter((p) => {
      const kw = search.trim().toLowerCase()
      if (!kw) return true
      return p.name.toLowerCase().includes(kw) || (p.owner?.username ?? '').toLowerCase().includes(kw)
    })
    // 默认排序：先按状态分类分组，组内按最近动态时间倒序（先更新的在前面）
    .sort((a, b) => {
      const g = groupIndex(PROJECT_STATUS_GROUP_ORDER, a.status) - groupIndex(PROJECT_STATUS_GROUP_ORDER, b.status)
      if (g !== 0) return g
      const ta = new Date(serverActivityAt(a) ?? a.created_at ?? 0).getTime()
      const tb = new Date(serverActivityAt(b) ?? b.created_at ?? 0).getTime()
      return tb - ta
    })

  const load = async () => {
    setLoading(true)
    try {
      const args =
        statusFilter === 'all' ? '' : `where: { status: { _eq: "${statusFilter}" }, `
      const data = await gql<{ project: ProjectRow[] }>(
        `query {
          project(${args}order_by: { id: desc }) {
            id name status review_level created_at
            owner { username }
            review_assignments(order_by: { level: desc }) { id level reviewer project_id }
            submissions(order_by: { id: desc }, limit: 1) { id created_at }
            analyses(order_by: { id: desc }, limit: 1) { id status created_at }
            questions(order_by: { id: desc }, limit: 1) { id status created_at }
          }
        }`,
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
  }, [statusFilter])

  const reviewLevelOf = (p: ProjectRow) =>
    p.review_level ? (
      `${p.review_level} 级`
    ) : (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        未设置
      </Badge>
    )

  const reviewersOf = (p: ProjectRow) =>
    p.review_assignments.length === 0 ? (
      <span className="text-slate-400">未指派</span>
    ) : (
      <div className="flex flex-wrap gap-1">
        {p.review_assignments.map((a) => (
          <Badge key={a.id} variant="outline" className="bg-slate-50">
            L{a.level} {a.reviewer}
          </Badge>
        ))}
      </div>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">项目总览（{visibleProjects.length}）</h1>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="w-52 bg-white pl-9"
              placeholder="搜索项目或客户…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="按状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {Object.entries(PROJECT_STATUS_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* 卡片 / 列表 切换 */}
          <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
            <button
              type="button"
              title="卡片视图"
              onClick={() => switchViewMode('card')}
              className={`flex h-9 w-10 items-center justify-center transition-colors ${
                viewMode === 'card' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="列表视图"
              onClick={() => switchViewMode('list')}
              className={`flex h-9 w-10 items-center justify-center transition-colors ${
                viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </CardContent>
        </Card>
      ) : visibleProjects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-slate-400">没有符合条件的项目</CardContent>
        </Card>
      ) : viewMode === 'card' ? (
        /* ---------- 卡片视图 ---------- */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map((p) => (
            <Card key={p.id} className="relative">
              {hasUnseenServerActivity(p, viewedScope) && <UpdateDot />}
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-6">{p.name || '未命名项目'}</CardTitle>
                  <ProjectStatusBadge status={p.status} />
                </div>
                <p className="text-xs text-slate-400">客户：{p.owner?.username ?? '—'}</p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">审核等级</span>
                  {reviewLevelOf(p)}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="shrink-0 text-slate-500">审核人</span>
                  {reviewersOf(p)}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                  <span>
                    {serverActivityAt(p) ? `更新于 ${formatTime(serverActivityAt(p))}` : `创建于 ${formatTime(p.created_at)}`}
                  </span>
                  {canManage && (
                    <Button size="sm" variant="outline" onClick={() => setManageTarget(p)}>
                      <Settings2 className="mr-1 h-4 w-4" /> 审核设置
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* ---------- 列表视图 ---------- */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>项目名称</TableHead>
                    <TableHead>所属客户</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>审核等级</TableHead>
                    <TableHead>审核人</TableHead>
                    <TableHead>最近动态</TableHead>
                    {canManage && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProjects.map((p) => (
                    <TableRow key={p.id} className="relative">
                      <TableCell className="font-medium">
                        {p.name || '未命名项目'}
                        {hasUnseenServerActivity(p, viewedScope) && <UpdateDot />}
                      </TableCell>
                      <TableCell>{p.owner?.username ?? '—'}</TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>{reviewLevelOf(p)}</TableCell>
                      <TableCell>{reviewersOf(p)}</TableCell>
                      <TableCell className="text-slate-500">
                        {serverActivityAt(p) ? formatTime(serverActivityAt(p)) : formatTime(p.created_at)}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setManageTarget(p)}>
                            <Settings2 className="mr-1 h-4 w-4" /> 审核设置
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {manageTarget && (
        <ReviewSettingDialog
          project={manageTarget}
          username={auth!.account.username}
          onClose={() => setManageTarget(null)}
          onChanged={() => {
            setManageTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}

/* ---------------- 审核设置（超管） ---------------- */

function ReviewSettingDialog({
  project,
  username,
  onClose,
  onChanged,
}: {
  project: ProjectRow
  username: string
  onClose: () => void
  onChanged: () => void
}) {
  const [level, setLevel] = useState(String(project.review_level ?? 3))
  const [assignments, setAssignments] = useState<ReviewAssignment[]>(project.review_assignments)
  const [newLevel, setNewLevel] = useState('3')
  const [newReviewer, setNewReviewer] = useState('')
  const [saving, setSaving] = useState(false)
  const [reviewers, setReviewers] = useState<{ username: string; reviewer_level: number | null }[]>([])

  // 加载可指派的审核员（按级别筛选）
  useEffect(() => {
    ;(async () => {
      try {
        const data = await gql<{ account: { username: string; reviewer_level: number | null }[] }>(
          `query {
            account(where: { account_type: { _eq: "reviewer" }, status: { _eq: "active" } }, order_by: { username: asc }) {
              username reviewer_level
            }
          }`,
        )
        setReviewers(data.account)
      } catch {
        /* 列表加载失败不阻塞 */
      }
    })()
  }, [])

  const candidateReviewers = reviewers.filter((r) => r.reviewer_level === Number(newLevel))

  const saveLevel = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const lv = Number(level)
      await gql(
        `mutation($id: bigint!, $lv: bigint!) {
          update_project_by_pk(pk_columns: { id: $id }, _set: { review_level: $lv }) { id }
        }`,
        { id: project.id, lv },
      )
      // 同步在审内容到新的审核节点：待设置的进入对应级别，已在链上的重置到该级起点
      await gql(
        `mutation($pid: bigint!, $st: String!, $stage: bigint!) {
          update_analysis(
            where: { project_id: { _eq: $pid }, status: { _in: ["pending_setup", "pending_l3", "pending_l2", "pending_l1"] } },
            _set: { status: $st, current_stage: $stage }
          ) { affected_rows }
        }`,
        { pid: project.id, st: `pending_l${lv}`, stage: lv },
      )
      await logOperation({
        projectId: project.id,
        operator: username,
        action: `调整审核等级为 ${level} 级（已同步在审内容）`,
        targetType: 'project',
        targetId: project.id,
      })
      toast.success('审核等级已更新，在审内容已同步到对应节点')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const addAssignment = async () => {
    if (!newReviewer) {
      toast.error('请选择审核人')
      return
    }
    try {
      // 同一级别只保留一个审核人：先移除该级别原有指派
      const existing = assignments.filter((a) => a.level === Number(newLevel))
      for (const a of existing) {
        await gql(`mutation($id: bigint!) { delete_review_assignment_by_pk(id: $id) { id } }`, { id: a.id })
      }
      const data = await gql<{ insert_review_assignment_one: ReviewAssignment }>(
        `mutation($obj: review_assignment_insert_input!) {
          insert_review_assignment_one(object: $obj) { id level reviewer project_id }
        }`,
        { obj: { project_id: project.id, level: Number(newLevel), reviewer: newReviewer } },
      )
      await logOperation({
        projectId: project.id,
        operator: username,
        action: `指派 ${newLevel} 级审核人 ${newReviewer}`,
        targetType: 'review_assignment',
        targetId: data.insert_review_assignment_one.id,
      })
      setAssignments((prev) =>
        [...prev.filter((a) => a.level !== Number(newLevel)), data.insert_review_assignment_one].sort(
          (a, b) => b.level - a.level,
        ),
      )
      setNewReviewer('')
      toast.success('已指派')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '指派失败')
    }
  }

  const removeAssignment = async (a: ReviewAssignment) => {
    try {
      await gql(`mutation($id: bigint!) { delete_review_assignment_by_pk(id: $id) { id } }`, { id: a.id })
      await logOperation({
        projectId: project.id,
        operator: username,
        action: `移除 ${a.level} 级审核人 ${a.reviewer}`,
        targetType: 'review_assignment',
        targetId: a.id,
      })
      setAssignments((prev) => prev.filter((x) => x.id !== a.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '移除失败')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>审核设置 · {project.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={saveLevel} className="flex items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label>项目审核等级</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">三级审核（完整流程）</SelectItem>
                <SelectItem value="2">二级审核起</SelectItem>
                <SelectItem value="1">一级审核（仅终审）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="bg-slate-900 hover:bg-slate-800" disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} 保存
          </Button>
        </form>

        <div className="space-y-3 border-t pt-4">
          <Label>各级审核人</Label>
          {assignments.length === 0 && <p className="text-sm text-slate-400">暂未指派审核人</p>}
          <div className="space-y-2">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {a.level} 级
                </Badge>
                <span className="text-sm">{a.reviewer}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                  onClick={() => removeAssignment(a)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="w-28 space-y-1.5">
              <Label className="text-xs">级别</Label>
              <Select value={newLevel} onValueChange={setNewLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 级</SelectItem>
                  <SelectItem value="2">2 级</SelectItem>
                  <SelectItem value="1">1 级</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">审核人</Label>
              <Select value={newReviewer} onValueChange={setNewReviewer}>
                <SelectTrigger>
                  <SelectValue placeholder="选择审核员" />
                </SelectTrigger>
                <SelectContent>
                  {candidateReviewers.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      暂无 {newLevel} 级审核员账号
                    </SelectItem>
                  ) : (
                    candidateReviewers.map((r) => (
                      <SelectItem key={r.username} value={r.username}>
                        {r.username}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={addAssignment}>
              <Plus className="mr-1 h-4 w-4" /> 指派
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
