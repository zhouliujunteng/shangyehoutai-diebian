/**
 * 附件（过渡版）：图片/文件以 base64 存入 JSONB 列。
 * 图片客户端压缩（最长边 1600px、JPEG 0.82）；单附件压缩后 ≤ 1.5MB 才允许。
 * 后续迁移到 Zion presigned 直传后仅需替换读写层。
 */
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Paperclip, X, FileText, Loader2 } from 'lucide-react'

export interface AttachmentItem {
  name: string
  mime: string
  size: number
  data: string // base64（不含 data: 前缀）
}

const MAX_RAW = 1.5 * 1024 * 1024

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

async function compressImage(file: File): Promise<{ blob: Blob; mime: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
    if (scale >= 1 && file.size <= 600 * 1024) return { blob: file, mime: file.type }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.82))
    return { blob, mime: 'image/jpeg' }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function fileToAttachment(file: File): Promise<AttachmentItem> {
  let blob: Blob = file
  let mime = file.type || 'application/octet-stream'
  if (mime.startsWith('image/')) {
    const c = await compressImage(file)
    blob = c.blob
    mime = c.mime
  }
  if (blob.size > MAX_RAW) {
    throw new Error(`「${file.name}」压缩后仍超过 1.5MB，请更换更小的文件`)
  }
  const dataUrl = await readAsDataURL(blob)
  return { name: file.name, mime, size: blob.size, data: dataUrl.split(',')[1] }
}

export function attachmentUrl(a: AttachmentItem): string {
  return `data:${a.mime};base64,${a.data}`
}

/* ---------------- 选择器 ---------------- */

export function AttachmentPicker({
  value,
  onChange,
  disabled,
}: {
  value: AttachmentItem[]
  onChange: (v: AttachmentItem[]) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const items = [...value]
      for (const f of Array.from(files)) {
        items.push(await fileToAttachment(f))
      }
      onChange(items)
    } catch (e) {
      alert(e instanceof Error ? e.message : '附件处理失败')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1.5 h-4 w-4" />}
          添加图片/文件
        </Button>
        <span className="text-xs text-slate-400">图片自动压缩，单个 ≤ 1.5MB</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
              {a.mime.startsWith('image/') ? (
                <img src={attachmentUrl(a)} alt={a.name} className="h-8 w-8 rounded object-cover" />
              ) : (
                <FileText className="h-4 w-4 text-slate-400" />
              )}
              <span className="max-w-32 truncate">{a.name}</span>
              {!disabled && (
                <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- 展示 ---------------- */

export function AttachmentView({ items }: { items: AttachmentItem[] | null | undefined }) {
  if (!items?.length) return null
  const images = items.filter((a) => a.mime.startsWith('image/'))
  const files = items.filter((a) => !a.mime.startsWith('image/'))
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a, i) => (
            <a key={i} href={attachmentUrl(a)} target="_blank" rel="noreferrer">
              <img src={attachmentUrl(a)} alt={a.name} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((a, i) => (
            <a
              key={i}
              href={attachmentUrl(a)}
              download={a.name}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="max-w-40 truncate">{a.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
