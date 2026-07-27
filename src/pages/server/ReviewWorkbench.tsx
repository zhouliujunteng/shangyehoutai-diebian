import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { gql } from '@/lib/graphql'
import { useAuth, myReviewLevel, pendingStatusForLevel } from '@/lib/auth'
import { formatTime } from '@/lib/labels'
import { isUnseen, groupIndex, REVIEW_STATUS_GROUP_ORDER } from '@/lib/projectMeta'
import type { Analysis } from '@/lib/types'
import { ReviewStatusBadge } from '@/components/StatusBadge'
import UpdateDot from '@/components/UpdateDot'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, ArrowRight, Search, RefreshCw } from 'lucide-react'

export default function ReviewWorkbench() {
  const { auth } = useAuth()
  const navigate = useNavigate()
  const [list, setList] = useState<Analysis[]>([])
  const [assignMap, setAssignMap] = useState<Record<number, Record<number, string>>>({})
  const [loading, setLoading] = useState(true)

  const level = myReviewLevel(auth?.account)
  const pendingStatus = pendingStatusForLevel(level)
  const myName = auth?.account.username ?? ''
  const [tab, setTab] = useState<'mine' | 'assigned' | 'all'>('mine')
  const [allList, setAllList] = useState<Analysis[]>([])
  const [assignedList, setAssignedList] = useState<Analysis[]>([])
  const [myLevels, setMyLevels] = useState<Record<number, number[]>>({})
  const [search, setSearch] = useState('')

  const loadMine = async () => {
    setLoading(true)
    try {
      const data = await gql<{ analysis: Analysis[]; review_assignment: { project_id: number; level: number; reviewer: string }[] }>(
        `query($st: String!) {
          analysis(where: { status: { _eq: $st } }, order_by: { id: desc }) {
            id version status current_stage project_id created_at
            project { id name }
          }
          review_assignment { project_id level reviewer }
        }`,
        { st: pendingStatus },
      )
      setList(data.analysis)
      const map: Record<number, Record<number, string>> = {}
      for (const a of data.review_assignment) {
        ;(map[a.project_id] ??= {})[a.level] = a.reviewer
      }
      setAssignMap(map)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const data = await gql<{ analysis: Analysis[] }>(
        `query {
          analysis(order_by: { id: desc }, limit: 100) {
            id version status current_stage project_id created_at
            project { id name current_analysis_id }
          }
        }`,
      )
      setAllList(data.analysis)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 「我负责的」：加载分配给我的项目及其方案
  const loadAssigned = async () => {
    setLoading(true)
    try {
      const data = await gql<{ review_assignment: { project_id: number; level: number }[]; analysis: Analysis[] }>(
        `query($name: String!) {
          review_assignment(where: { reviewer: { _eq: $name } }, order_by: { level: desc }) { project_id level }
          analysis(order_by: { id: desc }, limit: 100) {
            id version status current_stage project_id created_at
            project { id name current_analysis_id }
          }
        }`,
        { name: myName },
      )
      const pids = new Set(data.review_assignment.map((a) => a.project_id))
      const levels: Record<number, number[]> = {}
      for (const a of data.review_assignment) (levels[a.project_id] ??= []).push(a.level)
      setMyLevels(levels)
      setAssignedList(data.analysis.filter((a) => pids.has(a.project_id)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStatus])

  // 「全部梳理报告」：超管/一级审核员可查看任意状态的报告（只读入口）
  useEffect(() => {
    if (tab === 'all') loadAll()
    else if (tab === 'assigned') loadAssigned()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // 某级别已指派审核人时，只有被指派人能看到该任务；未指派则同级所有人可见
  const visibleList = list.filter((a) => {
    const assignee = assignMap[a.project_id]?.[level]
    return !assignee || assignee === myName
  })

  const kw = search.trim().toLowerCase()
  const matchKw = (a: Analysis) => !kw || (a.project?.name ?? '').toLowerCase().includes(kw)
  const viewedScope = `server:${myName}`
  /** 按项目去重：优先「当前版本」指针所指，其次已发布，否则最新版 */
  const groupByProject = (list: Analysis[]) => {
    const map = new Map<number, Analysis>()
    for (const a of list) {
      const cur = map.get(a.project_id)
      const curId = a.project?.current_analysis_id ?? null
      if (!cur) map.set(a.project_id, a)
      else if (curId && a.id === curId) map.set(a.project_id, a)
      else if (!curId && a.status === 'published' && cur.status !== 'published') map.set(a.project_id, a)
    }
    return [...map.values()]
  }
  // 「全部梳理报告」按项目去重：每个项目只显示一条；其余版本进入详情后切换查看
  const groupedAll = groupByProject(allList)
  const groupedAssigned = groupByProject(assignedList)
  // 默认排序：先按审核状态分类分组，组内按提交时间倒序（先更新的在前面）
  const shownList = (tab === 'mine' ? visibleList : tab === 'assigned' ? groupedAssigned : groupedAll)
    .filter(matchKw)
    .sort((a, b) => {
      const g = groupIndex(REVIEW_STATUS_GROUP_ORDER, a.status) - groupIndex(REVIEW_STATUS_GROUP_ORDER, b.status)
      if (g !== 0) return g
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    })

  /* 手机端卡片：竖排展示，无需横向滑动 */
  const analysisCard = (a: Analysis, linkTo: (x: Analysis) => string, suffix?: (x: Analysis) => React.ReactNode) => (
    <Card key={a.id} className="relative">
      {isUnseen(a.created_at, a.project_id, viewedScope) && <UpdateDot />}
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">
              {a.project?.name ?? `#${a.project_id}`}
              {suffix?.(a)}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              v{a.version} · {formatTime(a.created_at)}
            </p>
          </div>
          <ReviewStatusBadge status={a.status} />
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <Button size="sm" variant="outline" onClick={() => navigate(linkTo(a))}>
            查看 <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const renderTable = (rows: Analysis[], linkTo: (x: Analysis) => string, suffix?: (x: Analysis) => React.ReactNode) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>项目</TableHead>
            <TableHead>版本</TableHead>
            <TableHead>当前状态</TableHead>
            <TableHead>提交时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id} className="relative">
              <TableCell className="font-medium">
                {a.project?.name ?? `#${a.project_id}`}
                {isUnseen(a.created_at, a.project_id, viewedScope) && <UpdateDot />}
                {suffix?.(a)}
              </TableCell>
              <TableCell>v{a.version}</TableCell>
              <TableCell>
                <ReviewStatusBadge status={a.status} />
              </TableCell>
              <TableCell className="text-slate-500">{formatTime(a.created_at)}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => navigate(linkTo(a))}>
                  查看 <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">审核工作台</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (tab === 'mine' ? loadMine() : tab === 'assigned' ? loadAssigned() : loadAll())}
            title="刷新"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <span className="text-sm text-slate-500">
            我的级别：{level} 级{auth?.account.account_type === 'super_admin' ? '（超管·终审）' : ''}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={tab === 'mine' ? 'default' : 'outline'}
          className={tab === 'mine' ? 'bg-slate-900 hover:bg-slate-800' : ''}
          onClick={() => setTab('mine')}
        >
          待我审核（{visibleList.length}）
        </Button>
        <Button
          size="sm"
          variant={tab === 'assigned' ? 'default' : 'outline'}
          className={tab === 'assigned' ? 'bg-slate-900 hover:bg-slate-800' : ''}
          onClick={() => setTab('assigned')}
        >
          我负责的（{groupedAssigned.length}）
        </Button>
        <Button
          size="sm"
          variant={tab === 'all' ? 'default' : 'outline'}
          className={tab === 'all' ? 'bg-slate-900 hover:bg-slate-800' : ''}
          onClick={() => setTab('all')}
        >
          全部梳理报告（{groupedAll.length}）
        </Button>
        <div className="relative min-w-0 flex-1 sm:flex-none sm:ml-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="w-full bg-white pl-9 sm:w-52"
            placeholder="搜索项目名称…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {loading ? (
        <Card>
          <CardContent className="flex justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </CardContent>
        </Card>
      ) : shownList.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-slate-400">没有符合条件的梳理报告</CardContent>
        </Card>
      ) : (
        <>
          {/* 手机端：竖排卡片 */}
          <div className="space-y-3 sm:hidden">
            {shownList.map((a) =>
              analysisCard(
                a,
                tab === 'assigned' ? (x) => `/server/replies/${x.project_id}` : (x) => `/server/review/${x.id}`,
                tab === 'mine'
                  ? (x) =>
                      assignMap[x.project_id]?.[level] === myName ? (
                        <span className="ml-1.5 text-xs font-normal text-blue-500">（指派给我）</span>
                      ) : null
                  : tab === 'assigned'
                    ? (x) => (
                        <span className="ml-1.5 text-xs font-normal text-violet-500">
                          （我负责 L{(myLevels[x.project_id] ?? []).join('/')}）
                        </span>
                      )
                    : undefined,
              ),
            )}
          </div>
          {/* 平板/桌面：表格 */}
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              {renderTable(
                shownList,
                tab === 'assigned' ? (x) => `/server/replies/${x.project_id}` : (x) => `/server/review/${x.id}`,
                tab === 'mine'
                  ? (x) =>
                      assignMap[x.project_id]?.[level] === myName ? (
                        <span className="ml-1.5 text-xs font-normal text-blue-500">（指派给我）</span>
                      ) : null
                  : tab === 'assigned'
                    ? (x) => (
                        <span className="ml-1.5 text-xs font-normal text-violet-500">
                          （我负责 L{(myLevels[x.project_id] ?? []).join('/')}）
                        </span>
                      )
                    : undefined,
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
