import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { gql, logOperation } from '@/lib/graphql'
import { useAuth } from '@/lib/auth'
import { formatTime } from '@/lib/labels'
import { accountDisplayName, projectDisplayName, type Account, type Project } from '@/lib/types'
import { ClientProjectStatusBadge as ProjectStatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { ArrowRight, Building2, FolderPlus, Loader2, RefreshCw, UserCheck } from 'lucide-react'

/**
 * 客户（企业主本人）工作台：自助创建企业 → 上传面谈录音 → 自动整理企业信息 → 方案推进。
 * 账号由后台统一开通；顾问在顾问工作台自行认领，认领后卡点自动匹配给该顾问。
 */
export default function CustomerDashboard() {
  const { auth, refreshAccount } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [consultant, setConsultant] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [remark, setRemark] = useState('')
  const [creating, setCreating] = useState(false)

  const quota = auth?.account.project_quota ?? 0
  const used = projects.length
  const quotaFull = quota > 0 && used >= quota

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
      // 我的顾问（认领我的顾问账号）
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

  const onCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (quotaFull) {
      toast.error(`企业名额已用完（${used}/${quota}），如需更多请联系平台管理员`)
      return
    }
    setCreating(true)
    try {
      const data = await gql<{ insert_project_one: { id: number } }>(
        `mutation($obj: project_insert_input!) {
          insert_project_one(object: $obj) { id }
        }`,
        {
          obj: {
            name: name.trim(),
            remark: remark.trim() || null,
            owner_id: auth!.account.id,
            status: 'created',
            review_level: null,
          },
        },
      )
      const pid = data.insert_project_one.id
      await logOperation({
        projectId: pid,
        operator: auth!.account.username,
        action: '客户自助创建企业',
        targetType: 'project',
        targetId: pid,
        detail: { name: name.trim(), remark: remark.trim() || null },
      })
      toast.success('企业已创建，请上传面谈录音，系统会自动整理企业信息')
      setDialogOpen(false)
      setName('')
      setRemark('')
      navigate(`/customer/project/${pid}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

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
              <span className="ml-2 text-xs text-slate-400">遇到卡点时系统会自动对接给你的顾问</span>
            </p>
          ) : (
            <p className="text-sm text-slate-400">顾问正在认领中，认领后在此显示；不影响你正常使用系统。</p>
          )}
        </CardContent>
      </Card>

      {/* 配额用量 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">企业名额</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={quota > 0 ? Math.min(100, (used / quota) * 100) : 0} className="h-2 flex-1" />
            <span className="whitespace-nowrap text-sm text-slate-600">
              已用 {used} / {quota > 0 ? quota : '不限'}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">我的企业</h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} title="刷新">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            className="bg-slate-900 hover:bg-slate-800"
            disabled={quotaFull}
            onClick={() => setDialogOpen(true)}
            title={quotaFull ? '已达名额上限' : undefined}
          >
            <FolderPlus className="mr-1.5 h-4 w-4" /> 创建我的企业
          </Button>
        </div>
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
            <p className="text-sm text-slate-500">还没有企业信息，点击「创建我的企业」开始</p>
            <p className="text-xs text-slate-400">创建后上传面谈录音，系统会自动整理企业信息并生成方案</p>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建我的企业</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>企业名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="企业 / 公司名称（也可留空，录音整理后自动回填）" />
            </div>
            <div className="space-y-2">
              <Label>备注（选填，仅自己可见）</Label>
              <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="例如：主营餐饮，30 人团队" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" className="bg-slate-900 hover:bg-slate-800" disabled={creating}>
                {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                创建
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
