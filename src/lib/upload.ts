/**
 * 文件上传（Zion presigned 直传）：计算 MD5 → 取预签名 URL → PUT 原始文件 → 返回下载地址。
 * 用于音频面谈文件上传，供后续工作流（语音转写）按 URL 拉取。
 */
import SparkMD5 from 'spark-md5'
import { gql } from '@/lib/graphql'

export interface UploadedFile {
  downloadUrl: string
  /** 文件外部 ID（exId） */
  fileId: string
  /** 文件内部数值 ID（写 FILE 列时用，audio_file_id 只收 Long） */
  fileDbId: number
}

/** 计算文件内容的 MD5 并转为 Base64（Zion 预签名接口要求） */
async function md5Base64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const hex = SparkMD5.ArrayBuffer.hash(buf)
  const bytes = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

interface PresignedResult {
  uploadUrl: string
  uploadHeaders: unknown
  downloadUrl: string
  exId: string
  contentType: string
}

/** 上传文件到 Zion 资源存储（CDN 公开可读），onProgress 回调 0-100 的百分比 */
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<UploadedFile> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const format = ext.toUpperCase()
  const md5 = await md5Base64(file)
  const data = await gql<{ filePresignedUrlV2: PresignedResult }>(
    `query($md5: String!, $format: MediaFormat!, $name: String, $suffix: String, $size: Int, $acl: CannedAccessControlList) {
      filePresignedUrlV2(md5Base64: $md5, format: $format, name: $name, suffix: $suffix, sizeBytes: $size, acl: $acl) {
        uploadUrl uploadHeaders downloadUrl exId contentType
      }
    }`,
    { md5, format, name: file.name, suffix: ext, size: file.size, acl: 'PUBLIC_READ' },
  )
  const p = data.filePresignedUrlV2
  // uploadHeaders 可能是 JSON 字符串或对象，按文档要求全部带上，不得省略或改写
  const headers: Record<string, string> =
    typeof p.uploadHeaders === 'string'
      ? JSON.parse(p.uploadHeaders)
      : ((p.uploadHeaders ?? {}) as Record<string, string>)
  // 用 XHR 以获取真实上传进度（fetch 不支持 upload progress）
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', p.uploadUrl)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve()
      } else {
        reject(new Error(`文件上传失败（HTTP ${xhr.status}），请重试`))
      }
    }
    xhr.onerror = () => reject(new Error('网络连接失败，文件上传中断，请重试'))
    xhr.send(file)
  })
  // FILE 列写入需要内部数值 id：用 exId 兑换（getFileByExId）
  const fd = await gql<{ getFileByExId: { id: number } | null }>(
    `query($e: String!) { getFileByExId(fileExId: $e) { id } }`,
    { e: p.exId },
  )
  if (!fd.getFileByExId) throw new Error('文件登记失败，请重试')
  return { downloadUrl: p.downloadUrl, fileId: p.exId, fileDbId: fd.getFileByExId.id }
}
