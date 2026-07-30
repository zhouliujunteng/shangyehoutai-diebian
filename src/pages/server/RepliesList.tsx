import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { gql } from '@/lib/graphql'
import { useAuth, myReviewLevel, pendingStatusForLevel } from '@/lib/auth'
import { formatTime } from '@/lib/labels'
import { isUnseen } from '@/lib/projectMeta'
import type { Question } from '@/lib/types'
import { ReviewStatusBadge } from '@/components/StatusBadge'
import UpdateDot from '@/components/UpdateDot'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, ArrowRight, Search, RefreshCw } from 'lucide-react'

interface FeedbackRow {
  id: number
  status: string
  created_at?: string
  link?: { project_id: number; project?: { id: number; name: string } | null } | null
  feedback_replies?: { id: number; status: string; current_stage: number; created_at?: string }[]
}

interface ProjectGroup {
  project_id: number
  name: string
  questions: Question[]
  feedbackCount: number
  needMeCount: number
  latestTime?: string
  latestReplyStatus?: string | null
}

export default function RepliesList() {
  const { auth } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<ProjectGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const myLevel = myReviewLevel(auth?.account)
  const myPending = pendingStatusForLevel(myLevel)

  const kw = search.trim().toLowerCase()
  const viewedScope = `server:${auth?.account.username ?? ''}`
  // 默认排序：最新更新的项目排在最上面
  const visibleGroups = groups
    .filter((g) => !kw || g.name.toLowerCase().includes(kw))
    .sort((a, b) => new Date(b.latestTime ?? 0).getTime() - new Date(a.latestTime ?? 0).getTime())

  const load = async () => {
    setLoading(true)
    try {
      const data = await gql<{ question: Question[]; feedback_submission: FeedbackRow[] }>(
        `query {
          question(order_by: { id: desc }) {
            id content status project_id created_at
            project { id name }
            replies(order_by: { id: desc }, limit: 1) { id content status current_stage question_id created_at }
          }
          feedback_submission(order_by: { id: desc }) {
            id status created_at
            link { project_id project { id name } }
            feedback_replies(order_by: { id: desc }, limit: 1) { id status current_stage created_at }
          }
        }`,
      )
      const needMe = (q: Question): boolean => {
        const r = q.replies?.[0]
        if (q.status === 'replied') return false
        if (!r) return true // 还没有回复草稿，任何服务端人员可起草
        return r.status === myPending
      }
      const needMeFb = (f: FeedbackRow): boolean => {
        const r = f.feedback_replies?.[0]
        if (f.status === 'replied') return false
        if (!r) return true // 反馈未起草回复，任何服务端人员可处理
        return r.status === myPending
      }
      const ensureGroup = (pid: number, name: string | undefined, ts?: string): ProjectGroup => {
        if (!map.has(pid)) {
          map.set(pid, {
            project_id: pid,
            name: name ?? `项目 #${pid}`,
            questions: [],
            feedbackCount: 0,
            needMeCount: 0,
            latestTime: ts,
            latestReplyStatus: null,
          })
        }
        return map.get(pid)!
      }
      const bumpTime = (g: ProjectGroup, ts?: string) => {
        if (ts && new Date(ts).getTime() > new Date(g.latestTime ?? 0).getTime()) g.latestTime = ts
      }
      const map = new Map<number, ProjectGroup>()
      for (const q of data.question) {
        const g = ensureGroup(q.project_id, q.project?.name, q.created_at)
        g.questions.push(q)
        if (needMe(q)) g.needMeCount += 1
        const r = q.replies?.[0]
        if (r && !g.latestReplyStatus) g.latestReplyStatus = r.status
        // 最新时间取提问与回复中的较新者
        const rTs = r?.created_at ? new Date(r.created_at).getTime() : 0
        const qTs = q.created_at ? new Date(q.created_at).getTime() : 0
        const latest = Math.max(rTs, qTs)
        if (latest > new Date(g.latestTime ?? 0).getTime()) g.latestTime = new Date(latest).toISOString()
      }
      for (const f of data.feedback_submission) {
        const pid = f.link?.project_id
        if (!pid) continue
        const g = ensureGroup(pid, f.link?.project?.name, f.created_at)
        g.feedbackCount += 1
        if (needMeFb(f)) g.needMeCount += 1
        const r = f.feedback_replies?.[0]
        if (r && !g.latestReplyStatus) g.latestReplyStatus = r.status
        bumpTime(g, f.created_at)
        bumpTime(g, r?.created_at)
      }
      setGroups([...map.values()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPending])

  /* 手机端卡片：竖排展示，无需横向滑动 */
  const groupCard = (g: ProjectGroup) => (
    <Card key={g.project_id} className="relative">
      {isUnseen(g.latestTime, g.project_id, viewedScope) && <UpdateDot />}
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">{g.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {g.questions.length} 条提问{g.feedbackCount > 0 ? ` · ${g.feedbackCount} 条反馈` : ''} · {formatTime(g.latestTime)}
            </p>
          </div>
          {g.latestReplyStatus ? (
            <ReviewStatusBadge status={g.latestReplyStatus} />
          ) : (
            <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200">
              未起草
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          {g.needMeCount > 0 ? (
            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
              {g.needMeCount} 条待我处理
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">暂无待处理</span>
          )}
          <Button size="sm" variant="outline" onClick={() => navigate(`/server/replies/${g.project_id}`)}>
            处理 <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-900">回复处理（{visibleGroups.length} 个项目）</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={load} title="刷新">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="w-full bg-white pl-9 sm:w-52"
              placeholder="搜索项目名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-sm text-slate-500">我的级别：{myLevel} 级</span>
        </div>
      </div>
      {loading ? (
        <Card>
          <CardContent className="flex justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </CardContent>
        </Card>
      ) : visibleGroups.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-slate-400">没有符合条件的提问</CardContent>
        </Card>
      ) : (
        <>
          {/* 手机端：竖排卡片 */}
          <div className="space-y-3 sm:hidden">{visibleGroups.map((g) => groupCard(g))}</div>
          {/* 平板/桌面：表格 */}
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>项目名称</TableHead>
                    <TableHead>提问 / 反馈</TableHead>
                    <TableHead>动态</TableHead>
                    <TableHead>回复状态</TableHead>
                    <TableHead>最新时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleGroups.map((g) => (
                    <TableRow key={g.project_id} className="relative">
                      <TableCell className="font-medium">
                        {g.name}
                        {isUnseen(g.latestTime, g.project_id, viewedScope) && <UpdateDot />}
                      </TableCell>
                      <TableCell>
                        {g.questions.length}
                        {g.feedbackCount > 0 && <span className="text-slate-400"> / {g.feedbackCount}</span>}
                      </TableCell>
                      <TableCell>
                        {g.needMeCount > 0 ? (
                          <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                            {g.needMeCount} 条待我处理
                          </Badge>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {g.latestReplyStatus ? (
                          <ReviewStatusBadge status={g.latestReplyStatus} />
                        ) : (
                          <span className="text-sm text-slate-400">未起草</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500">{formatTime(g.latestTime)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/server/replies/${g.project_id}`)}>
                          处理 <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </>
      )}
    </div>
  )
}
