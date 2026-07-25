import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'

export interface ReportMeta {
  enterpriseName: string
  version: number
  generatedAt: string
}

/** 报告正文排版 CSS（Word / PDF 打印通用，A4） */
const REPORT_CSS = `
  @page { size: A4; margin: 2.4cm 2.2cm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif;
    font-size: 11.5pt; line-height: 1.8; color: #1a1a1a;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .report-header { border-bottom: 2.5pt solid #1e293b; padding-bottom: 14pt; margin-bottom: 4pt; }
  .platform { font-size: 9pt; letter-spacing: 2.5pt; color: #64748b; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; margin-bottom: 10pt; }
  h1.doc-title { font-size: 20pt; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; font-weight: 700; color: #0f172a; margin: 0 0 10pt 0; line-height: 1.35; }
  .meta-table { width: 100%; border-collapse: collapse; margin-top: 6pt; }
  .meta-table td { font-size: 9.5pt; color: #475569; padding: 2pt 0; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
  .meta-table td.k { width: 72pt; color: #94a3b8; }
  .confidential { margin-top: 8pt; font-size: 9pt; font-weight: 700; color: #b45309; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; letter-spacing: 1pt; }
  .report-body { margin-top: 14pt; }
  .report-body h1 { font-size: 15pt; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; font-weight: 700; color: #0f172a; margin: 18pt 0 8pt 0; }
  .report-body h2 { font-size: 13.5pt; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; font-weight: 700; color: #0f172a; margin: 20pt 0 8pt 0; padding-bottom: 4pt; border-bottom: 1pt solid #94a3b8; page-break-after: avoid; }
  .report-body h3 { font-size: 12pt; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; font-weight: 700; color: #1e293b; margin: 14pt 0 6pt 0; page-break-after: avoid; }
  .report-body p { margin: 6pt 0; text-align: justify; }
  .report-body strong { color: #0f172a; }
  .report-body ul, .report-body ol { margin: 6pt 0 6pt 0; padding-left: 20pt; }
  .report-body li { margin: 3pt 0; }
  .report-body li::marker { color: #64748b; }
  .report-body blockquote { margin: 8pt 0; padding: 8pt 12pt; background: #f1f5f9; color: #334155; }
  .report-body blockquote p { margin: 2pt 0; }
  .report-body hr { border: none; border-top: 0.75pt solid #e2e8f0; margin: 16pt 0; }
  .report-body table { width: 100%; border-collapse: collapse; margin: 10pt 0; font-size: 10.5pt; }
  .report-body th, .report-body td { border: 0.75pt solid #cbd5e1; padding: 5pt 8pt; text-align: left; }
  .report-body th { background: #f1f5f9; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
  .report-footer { margin-top: 24pt; padding-top: 10pt; border-top: 0.75pt solid #e2e8f0; font-size: 8.5pt; color: #94a3b8; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.6; }
`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function reportBodyHtml(meta: ReportMeta, markdown: string): string {
  const bodyHtml = renderToStaticMarkup(createElement(ReactMarkdown, null, markdown))
  return `
  <div class="report-header">
    <div class="platform">项目后台 · 企业服务平台</div>
    <h1 class="doc-title">${escapeHtml(meta.enterpriseName)} · 企业梳理报告</h1>
    <table class="meta-table">
      <tr><td class="k">企业名称</td><td>${escapeHtml(meta.enterpriseName)}</td></tr>
      <tr><td class="k">报告版本</td><td>第 ${meta.version} 版</td></tr>
      <tr><td class="k">梳理给出时间</td><td>${escapeHtml(meta.generatedAt)}</td></tr>
    </table>
    <div class="confidential">【仅供企业内部使用 · 请勿外传】</div>
  </div>
  <div class="report-body">${bodyHtml}</div>
  <div class="report-footer">
    本报告由企业服务平台咨询团队审核后交付。报告基于企业自行填写的收集表信息，相关数据未经独立核实，仅供经营决策参考。
  </div>`
}

/** 生成完整排版后的报告 HTML 文档 */
export function buildReportDocument(meta: ReportMeta, markdown: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.enterpriseName)} · 企业梳理报告</title>
<style>${REPORT_CSS}</style>
</head>
<body>
${reportBodyHtml(meta, markdown)}
</body>
</html>`
}

/** 导出 Word（.doc，含完整排版） */
export function downloadWord(doc: string, filename: string) {
  const blob = new Blob(['﻿' + doc], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 导出 PDF：离屏渲染排版文档 → 逐页切片 → 直接下载 PDF 文件（不调起打印对话框） */
export async function downloadPdf(meta: ReportMeta, markdown: string, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  // A4 @96dpi ≈ 794px 宽；页边距与 REPORT_CSS 的 @page 对齐
  const PAGE_W = 794
  const PAGE_H = 1123
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;background:#ffffff;`
  // 屏幕渲染时 body/@page 规则作用到容器上
  const scopedCss = REPORT_CSS.replace(/@page[^{}]*\{[^}]*\}/g, '').replace(/\bbody\s*\{/g, '.pdf-root {')
  host.innerHTML = `<style>${scopedCss}</style><div class="pdf-root" style="padding:68px 62px;">${reportBodyHtml(meta, markdown)}</div>`
  document.body.appendChild(host)
  try {
    const canvas = await html2canvas(host, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pdfW = 210
    const pageCanvas = document.createElement('canvas')
    const pageCtx = pageCanvas.getContext('2d')!
    const sliceH = Math.round((canvas.width / PAGE_W) * PAGE_H)
    let rendered = 0
    let pageIndex = 0
    while (rendered < canvas.height) {
      const h = Math.min(sliceH, canvas.height - rendered)
      pageCanvas.width = canvas.width
      pageCanvas.height = h
      pageCtx.fillStyle = '#ffffff'
      pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      pageCtx.drawImage(canvas, 0, rendered, canvas.width, h, 0, 0, canvas.width, h)
      const img = pageCanvas.toDataURL('image/jpeg', 0.95)
      if (pageIndex > 0) pdf.addPage()
      pdf.addImage(img, 'JPEG', 0, 0, pdfW, (h / canvas.width) * pdfW)
      rendered += h
      pageIndex += 1
    }
    pdf.save(filename)
  } finally {
    host.remove()
  }
}
