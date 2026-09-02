import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { gql } from '@/lib/graphql'
import { useAuth } from '@/lib/auth'
import { formatTime } from '@/lib/labels'
import { accountDisplayName, projectDisplayName, type Account, type Project } from '@/lib/types'
import { ClientProjectStatusBadge as ProjectStatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowRight, Building2, Loader2, RefreshCw, UserCheck } from 'lucide-react'

/**
 * 客户（企业主本人）工作台（纯展示）：企业由顾问创建、面谈录音由顾问上传，
 * 客户在这里看方案和推进进度、确认节点验收、在节点里提问、报卡点。
 * 账号由机构管理开通；分配顾问后卡点自动匹配给该顾问。
 */
export default function CustomerDashboard() {
  const { auth, refreshAccount } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [consultant, setConsultant] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      await refreshAccount()
      const data = await gql<{ project: Project[] }>(
        `query($uid: bigint!) {
          project(where: { owner_id: { _eq: $uid } }, order_by: { id: desc }) {
            id name remark status review_level current_analysis_id created_at
          }
        }`,
        { uid: auth!.account.id },
      )
      setProjects(data.project)
      // 我的顾问（分配给我的顾问账号）
      const cid = auth?.account.consultant_id
      if (cid) {
        const cd = await gql<{ account_by_pk: Account | null }>(
          `query($id: bigint!) { account_by_pk(id: $id) { id username nickname status } }`,
          { id: cid },
        )
        setConsultant(cd.account_by_pk)
      } else {
        setConsultant(null)
      }
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

  return (
    <div className="space-y-6">
      {/* 我的顾问 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4" /> 我的顾问
          </CardTitle>
        </CardHeader>
        <CardContent>
          {consultant ? (
            <p className="text-sm text-slate-600">
              {accountDisplayName(consultant)}
              <span className="ml-2 text-xs text-slate-400">节点里卡住了可以一键找他，问题会直接到他手上</span>
            </p>
          ) : (
            <p className="text-sm text-slate-400">顾问分配中，分配后在此显示；不影响你正常使用系统。</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">我的企业</h2>
        <Button variant="ghost" size="sm" onClick={load} title="刷新">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">你的顾问会帮你创建企业并上传面谈录音</p>
            <p className="text-xs text-slate-400">创建后这里会显示你的企业和方案推进情况，有问题随时在节点里提问</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/customer/project/${p.id}`)}
            >
              <CardContent className="flex items-center gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{projectDisplayName(p)}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                    <ProjectStatusBadge status={p.status} />
                    {formatTime(p.created_at)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
