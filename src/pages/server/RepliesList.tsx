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
import { Loader2, ArrowRight, Search } from 'lucide-react'

interface ProjectGroup {
  project_id: number
  name: string
  questions: Question[]
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

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const data = await gql<{ question: Question[] }>(
          `query {
            question(order_by: { id: desc }) {
              id content status project_id created_at
              project { id name }
              replies(order_by: { id: desc }, limit: 1) { id content status current_stage question_id created_at }
            }
          }`,
        )
        const needMe = (q: Question): boolean => {
          const r = q.replies?.[0]
          if (q.status === 'replied') return false
          if (!r) return true // 还没有回复草稿，任何服务端人员可起草
          return r.status === myPending
        }
        const map = new Map<number, ProjectGroup>()
        for (const q of data.question) {
          const pid = q.project_id
          if (!map.has(pid)) {
            map.set(pid, {
              project_id: pid,
              name: q.project?.name ?? `项目 #${pid}`,
              questions: [],
              needMeCount: 0,
              latestTime: q.created_at,
              latestReplyStatus: null,
            })
          }
          const g = map.get(pid)!
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
        setGroups([...map.values()])
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [myPending])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">回复处理（{visibleGroups.length} 个项目）</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="w-52 bg-white pl-9"
              placeholder="搜索项目名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-sm text-slate-500">我的级别：{myLevel} 级</span>
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16 text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
            </div>
          ) : visibleGroups.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">没有符合条件的提问</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>项目名称</TableHead>
                    <TableHead>提问数</TableHead>
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
                      <TableCell>{g.questions.length}</TableCell>
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
