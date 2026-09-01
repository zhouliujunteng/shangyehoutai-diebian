import { useCallback, useEffect, useRef, useState } from 'react'
import { gql, logOperation } from '@/lib/graphql'
import { uploadFile } from '@/lib/upload'
import { formatTime } from '@/lib/labels'
import type { Delivery } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { FileCheck2, FileText, Loader2, RefreshCw, Video } from 'lucide-react'

/**
 * 交付记录（第八点：人机配合 · 现场服务留档）：
 * - consultant（顾问）：现场服务完成后上传签字的交付确认书照片/扫描件 + 见证视频链接 + 服务情况
 * - customer（客户）：查看交付留档（确认书可看）
 * - server（服务老师）：只读
 */
export default function DeliveryCard({
  projectId,
  mode,
  username,
}: {
  projectId: number
  mode: 'server' | 'consultant' | 'customer'
  username: string
}) {
  const [items, setItems] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [visitDate, setVisitDate] = useState('')
  const [participants, setParticipants] = useState('')
  const [video, setVideo] = useState('')
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await gql<{ delivery: Delivery[] }>(
        `query($pid: bigint!) {
          delivery(where: { project_id: { _eq: $pid } }, order_by: { id: desc }) {
            id confirm_file { url name } witness_video visit_date participants note delivered_by created_at
          }
        }`,
        { pid: projectId },
      )
      setItems(data.delivery)
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
    if (!file) {
      toast.error('请上传签字的交付确认书（照片或扫描件）')
      return
    }
    setSaving(true)
    try {
      setUploadPct(0)
      const up = await uploadFile(file, setUploadPct)
      const ins = await gql<{ insert_delivery_one: { id: number } }>(
        `mutation($obj: delivery_insert_input!) { insert_delivery_one(object: $obj) { id } }`,
        {
          obj: {
            project_id: projectId,
            confirm_file_id: up.fileDbId,
            witness_video: video.trim() || null,
            visit_date: visitDate || null,
            participants: participants.trim() || null,
            note: note.trim() || null,
            delivered_by: username,
          },
        },
      )
      await logOperation({
        projectId,
        operator: username,
        action: '上传交付确认书',
        targetType: 'delivery',
        targetId: ins.insert_delivery_one.id,
        detail: { file_name: file.name, visit_date: visitDate || null, participants: participants.trim() || null },
      })
      toast.success('交付记录已留档，客户可见')
      setOpen(false)
      setFile(null)
      setVisitDate('')
      setParticipants('')
      setVideo('')
      setNote('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      setSaving(false)
      setUploadPct(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck2 className="h-4 w-4" /> 交付记录
          {items.length > 0 && <span className="text-xs font-normal text-slate-400">{items.length} 次现场交付</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'customer' && (
          <p className="text-sm text-slate-500">顾问现场服务的交付确认留档在这里，随时可以查看。</p>
        )}
        {mode === 'consultant' && (
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-slate-900 hover:bg-slate-800" onClick={() => setOpen(true)}>
              <FileCheck2 className="mr-1.5 h-4 w-4" /> 登记现场交付
            </Button>
            <Button variant="ghost" size="sm" onClick={load} title="刷新">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}

        {loading ? (
          <p className="flex items-center text-sm text-slate-400"><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 加载中…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-400">
            {mode === 'consultant' ? '还没有交付记录。现场服务完成后点「登记现场交付」留档。' : '暂无交付记录。'}
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((d) => (
              <div key={d.id} className="space-y-2 rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-800">{d.visit_date ?? formatTime(d.created_at)} 现场交付</span>
                  {d.delivered_by && <span className="text-xs text-slate-400">交付人：{d.delivered_by}</span>}
                </div>
                {d.participants && <p className="text-xs text-slate-500">参与高管：{d.participants}</p>}
                {d.note && <p className="whitespace-pre-wrap text-xs leading-5 text-slate-500">{d.note}</p>}
                <div className="flex flex-wrap gap-3 pt-1">
                  {d.confirm_file?.url && (
                    <a
                      href={d.confirm_file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 underline decoration-dotted hover:text-blue-800"
                    >
                      <FileText className="h-3.5 w-3.5" /> 查看交付确认书{d.confirm_file.name ? `（${d.confirm_file.name}）` : ''}
                    </a>
                  )}
                  {d.witness_video && (
                    <a
                      href={d.witness_video}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 underline decoration-dotted hover:text-blue-800"
                    >
                      <Video className="h-3.5 w-3.5" /> 成功见证视频
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 登记交付对话框（顾问） */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>登记现场交付</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>交付确认书（签字后拍照/扫描）*</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  {file ? file.name : '选择文件（图片或 PDF）'}
                </Button>
                {uploadPct !== null && <Progress value={uploadPct} className="h-2" />}
              </div>
              <div className="space-y-2">
                <Label>服务日期</Label>
                <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>参与高管（选填）</Label>
                <Input value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="例如：店长张某、财务李某" />
              </div>
              <div className="space-y-2">
                <Label>成功见证视频链接（选填）</Label>
                <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="视频链接（网盘/视频号等）" />
              </div>
              <div className="space-y-2">
                <Label>备注（选填）</Label>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="本次现场服务的情况、客户确认的事项…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button className="bg-slate-900 hover:bg-slate-800" disabled={saving} onClick={save}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                保存留档
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
