import { useCallback, useEffect, useState } from 'react'
import { gql, logOperation } from '@/lib/graphql'
import { formatTime } from '@/lib/labels'
import type { ConsultantSummary } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, NotebookPen, RefreshCw } from 'lucide-react'

/**
 * 顾问总结：顾问在服务过程中给客户写的总结（独立于节点，可写多条）。
 * 顾问可添加；客户 / 服务端只读。
 */
export default function SummaryCard({
  projectId,
  mode,
  username,
}: {
  projectId: number
  mode: 'server' | 'consultant' | 'customer'
  username: string
}) {
  const [items, setItems] = useState<ConsultantSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await gql<{ consultant_summary: ConsultantSummary[] }>(
        `query($pid: bigint!) {
          consultant_summary(where: { project_id: { _eq: $pid } }, order_by: { id: desc }) {
            id content author created_at
          }
        }`,
        { pid: projectId },
      )
      setItems(data.consultant_summary)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    const v = content.trim()
    if (!v) {
      toast.error('请输入总结内容')
      return
    }
    setSaving(true)
    try {
      const ins = await gql<{ insert_consultant_summary_one: { id: number } }>(
        `mutation($obj: consultant_summary_insert_input!) { insert_consultant_summary_one(object: $obj) { id } }`,
        { obj: { project_id: projectId, content: v, author: username } },
      )
      await logOperation({ projectId, operator: username, action: '给客户写总结', targetType: 'consultant_summary', targetId: ins.insert_consultant_summary_one.id })
      toast.success('总结已保存，客户可见')
      setOpen(false)
      setContent('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="h-4 w-4" /> 顾问总结
          {items.length > 0 && <span className="text-xs font-normal text-slate-400">{items.length} 条</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {mode === 'consultant' && (
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-slate-900 hover:bg-slate-800" onClick={() => setOpen(true)}>
              <NotebookPen className="mr-1.5 h-4 w-4" /> 写一条总结
            </Button>
            <Button variant="ghost" size="sm" onClick={load} title="刷新">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}
        {mode === 'customer' && items.length === 0 && !loading && (
          <p className="text-sm text-slate-400">顾问会阶段性给你写总结，帮你回顾这一段的进展。</p>
        )}
        {loading ? (
          <p className="flex items-center text-sm text-slate-400"><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 加载中…</p>
        ) : (
          items.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{s.content}</p>
              <p className="mt-1.5 text-xs text-slate-400">
                {s.author ?? '顾问'} · {formatTime(s.created_at)}
              </p>
            </div>
          ))
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>给客户写总结</DialogTitle>
            </DialogHeader>
            <Textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="这一阶段客户做了什么、做得怎么样、接下来重点盯什么…"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button className="bg-slate-900 hover:bg-slate-800" disabled={saving} onClick={save}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                保存（客户可见）
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
