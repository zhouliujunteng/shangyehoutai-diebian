/**
 * 角色分离对话展示：解析【说话人/角色】标签，按说话人分色气泡展示。
 * 兼容多种标签格式：【说话人1】：… 【角色A（张三）】：…；无标签时回退纯文本。
 */

interface Turn {
  speaker: string
  text: string
}

function parseTurns(transcript: string): Turn[] {
  const turns: Turn[] = []
  for (const raw of transcript.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = /^【([^】]+)】[：:]\s?(.*)$/.exec(line)
    if (m) {
      turns.push({ speaker: m[1], text: m[2] })
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += '\n' + line
    } else {
      turns.push({ speaker: '', text: line })
    }
  }
  return turns
}

/** 说话人配色（按首次出现顺序循环） */
const PALETTE = [
  { chip: 'bg-blue-100 text-blue-700', bubble: 'bg-blue-50 border-blue-100' },
  { chip: 'bg-emerald-100 text-emerald-700', bubble: 'bg-emerald-50 border-emerald-100' },
  { chip: 'bg-amber-100 text-amber-700', bubble: 'bg-amber-50 border-amber-100' },
  { chip: 'bg-violet-100 text-violet-700', bubble: 'bg-violet-50 border-violet-100' },
]

export default function TranscriptView({ transcript, className = '' }: { transcript: string; className?: string }) {
  const turns = parseTurns(transcript)
  const hasSpeakers = turns.some((t) => t.speaker)

  if (!hasSpeakers) {
    return (
      <p className={`whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 ${className}`}>
        {transcript}
      </p>
    )
  }

  const speakerIndex = new Map<string, number>()
  for (const t of turns) {
    if (t.speaker && !speakerIndex.has(t.speaker)) speakerIndex.set(t.speaker, speakerIndex.size)
  }

  return (
    <div className={`space-y-2 overflow-y-auto rounded-lg bg-slate-50 px-3 py-3 ${className}`}>
      {turns.map((t, i) => {
        const idx = speakerIndex.get(t.speaker) ?? 0
        const c = PALETTE[idx % PALETTE.length]
        return (
          <div key={i} className="flex flex-col gap-1">
            {t.speaker && (
              <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${c.chip}`}>
                {t.speaker}
              </span>
            )}
            <p className={`whitespace-pre-wrap rounded-lg border px-3 py-2 text-xs leading-5 text-slate-700 ${c.bubble}`}>
              {t.text}
            </p>
          </div>
        )
      })}
    </div>
  )
}
