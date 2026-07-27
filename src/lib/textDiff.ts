/**
 * 轻量级文本对比（无第三方依赖）：
 * 先做行级 LCS 对齐，再对「删除+新增」相邻的行对做字符级内联 diff。
 * 用于审核详情页的版本对比视图：删除=红色删除线，新增=绿色下划线。
 */

export type DiffPart = { type: 'same' | 'del' | 'ins'; text: string }

/** 通用 LCS 回溯，产出 same/del/ins 片段序列 */
function lcsDiff(a: string[], b: string[]): DiffPart[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const parts: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      parts.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push({ type: 'del', text: a[i] })
      i++
    } else {
      parts.push({ type: 'ins', text: b[j] })
      j++
    }
  }
  while (i < n) parts.push({ type: 'del', text: a[i++] })
  while (j < m) parts.push({ type: 'ins', text: b[j++] })
  return parts
}

/** 合并连续同类型片段，减少渲染节点数 */
function mergeRuns(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = []
  for (const p of parts) {
    const last = out[out.length - 1]
    if (last && last.type === p.type) last.text += p.text
    else out.push({ ...p })
  }
  return out
}

/** 行级对齐 + 修改行对的字符级内联 diff */
export function diffText(oldText: string, newText: string): DiffPart[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')
  const lineParts = lcsDiff(a, b)

  const out: DiffPart[] = []
  let k = 0
  while (k < lineParts.length) {
    const cur = lineParts[k]
    if (cur.type === 'same') {
      out.push({ type: 'same', text: cur.text + '\n' })
      k++
      continue
    }
    // 收集连续的 del 与 ins 行
    const dels: string[] = []
    const inss: string[] = []
    while (k < lineParts.length && lineParts[k].type === 'del') dels.push(lineParts[k++].text)
    while (k < lineParts.length && lineParts[k].type === 'ins') inss.push(lineParts[k++].text)
    // 修改对（del 与 ins 数量相近且都不为空）：逐对做字符级 diff
    if (dels.length > 0 && inss.length > 0) {
      const pairCount = Math.min(dels.length, inss.length)
      for (let p = 0; p < pairCount; p++) {
        const charParts = lcsDiff(dels[p].split(''), inss[p].split(''))
        out.push(...mergeRuns(charParts))
        out.push({ type: 'same', text: '\n' })
      }
      for (let p = pairCount; p < dels.length; p++) out.push({ type: 'del', text: dels[p] + '\n' })
      for (let p = pairCount; p < inss.length; p++) out.push({ type: 'ins', text: inss[p] + '\n' })
    } else {
      for (const d of dels) out.push({ type: 'del', text: d + '\n' })
      for (const s of inss) out.push({ type: 'ins', text: s + '\n' })
    }
  }
  return mergeRuns(out)
}
