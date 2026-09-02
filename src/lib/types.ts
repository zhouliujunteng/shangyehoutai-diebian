/** client=顾问（原客户服务账号，沿用历史值）；customer=客户（企业主本人）；org_admin=机构管理（客户端总管理，如盛世蝶变） */
export type AccountType = 'super_admin' | 'client' | 'reviewer' | 'customer' | 'org_admin'
export type AccountStatus = 'active' | 'disabled'

export interface Account {
  id: number | string
  username: string
  /** 用户自定义昵称（未设置时各处展示用户名） */
  nickname?: string | null
  /** 绑定的手机号（改密码的前置条件） */
  fz_phone_number?: string | null
  account_type: AccountType
  reviewer_level: number | null
  project_quota: number
  status: AccountStatus
  /** 认领该客户（customer）的顾问账号 id；未认领为空 */
  consultant_id?: number | null
  /** 所属机构管理账号 id（客户/顾问账号挂在机构下；机构管理账号自身为空） */
  org_id?: number | null
  /** 机构管理账号的默认顾问：新建客户账号自动认领给他 */
  default_consultant_id?: number | null
}

/** 账号展示名：优先昵称，未设置回退用户名 */
export function accountDisplayName(a?: { username: string; nickname?: string | null } | null): string {
  return a?.nickname?.trim() || a?.username || ''
}

export type ProjectStatus =
  | 'created'
  | 'collecting'
  | 'pending_confirm'
  | 'supplementing'
  | 'submitted'
  | 'analyzing'
  | 'in_review'
  | 'published'

export interface Project {
  id: number
  /** 项目名称：创建时为空，由填写人提交收集表后自动回填（企业名称/公司全称） */
  name: string
  /** 客户对项目/收集链接的备注（仅内部可见） */
  remark?: string | null
  status: ProjectStatus
  review_level: number | null
  /** 当前展示版本指针：指向哪份梳理报告，全端以此为准（客户端仅在其已发布时展示） */
  current_analysis_id?: number | null
  owner_id?: number | string
  created_at?: string
  owner?: { username: string } | null
}

/** 项目显示名：优先企业名称，其次备注，兜底未命名 */
export function projectDisplayName(p: { name?: string | null; remark?: string | null }): string {
  return p.name?.trim() || p.remark?.trim() || '未命名项目'
}

export type CollectLinkStatus = 'active' | 'submitted' | 'supplementing' | 'expired'

export interface CollectLink {
  id: number
  token: string
  status: CollectLinkStatus
  expires_at: string
  project_id: number
  created_at?: string
}

export type FormType = 'basic' | 'detailed'

export interface Submission {
  id: number
  form_type: FormType
  filler_name: string | null
  filler_contact: string | null
  answers: Record<string, string> | null
  is_supplement: boolean
  project_id: number
  created_at?: string
}

export type ReviewStatus = 'pending_setup' | 'pending_l3' | 'pending_l2' | 'pending_l1' | 'published' | 'superseded'

export interface Analysis {
  id: number
  version: number
  content: string
  /** 思想来源（仅审核人员可见，客户端无此列权限） */
  internal_ref?: string | null
  status: ReviewStatus
  current_stage: number
  /** 终审通过时间（发布时间）；未发布为空 */
  published_at?: string | null
  project_id: number
  created_at?: string
  project?: { id: number; name: string; current_analysis_id?: number | null } | null
}

export interface ReviewAssignment {
  id: number
  level: number
  reviewer: string
  project_id: number
}

export interface ReviewRecord {
  id: number
  target_type: 'analysis' | 'reply' | 'feedback_reply'
  target_id: string
  level: number
  reviewer: string
  decision: 'approved' | 'reanalyze' | 'returned'
  comment: string | null
  project_id: number
  created_at?: string
}

export type QuestionStatus = 'pending' | 'in_review' | 'replied'

export interface AttachmentPayload {
  name: string
  mime: string
  size: number
  data: string
}

export interface Question {
  id: number
  content: string
  status: QuestionStatus
  project_id: number
  attachments?: AttachmentPayload[] | null
  created_at?: string
  project?: { id: number; name: string } | null
  replies?: Reply[]
}

export interface Reply {
  id: number
  content: string
  status: ReviewStatus | 'published'
  current_stage: number
  question_id: number
  attachments?: AttachmentPayload[] | null
  created_at?: string
}

export interface OperationLog {
  id: number
  target_type: string | null
  target_id: string | null
  operator: string
  action: string
  detail: Record<string, unknown> | null
  project_id: number
  created_at?: string
}

/* ---------- 交付记录（现场交付确认书 + 见证留档） ---------- */

export interface Delivery {
  id: number
  confirm_file?: { url: string; name?: string | null } | null
  witness_video?: string | null
  visit_date?: string | null
  participants?: string | null
  note?: string | null
  delivered_by?: string | null
  project_id: number
  created_at?: string
}

/* ---------- 卡点记录（客户报卡点 → 自动匹配认领顾问） ---------- */

/** open=待顾问处理 / resolved=已解决 */
export type BlockageStatus = 'open' | 'resolved'

export interface Blockage {
  id: number
  plan_point_id?: number | null
  description?: string | null
  status: BlockageStatus
  consultant_id?: number | null
  customer_id?: number | null
  customer_name?: string | null
  handled_by?: string | null
  handle_note?: string | null
  handled_at?: string | null
  project_id: number
  created_at?: string
  project?: { id: number; name: string } | null
}

/* ---------- 方案问答（客户提问 → AI 起草 → 老师审核发出） ---------- */

/** submitted=已提交待起草 / drafting=AI起草中 / pending=待老师审核 / published=已发出 / failed=起草失败 */
export type PlanQaStatus = 'submitted' | 'drafting' | 'pending' | 'published' | 'failed'

export interface PlanQa {
  id: number
  question: string | null
  draft?: string | null
  answer?: string | null
  status: PlanQaStatus
  asked_by?: string | null
  answered_by?: string | null
  error_message?: string | null
  answered_at?: string | null
  project_id: number
  created_at?: string
}

/* ---------- 方案小点（节点式推进 · 验收制） ---------- */

/** draft=后台草稿(仅服务端) / confirmed=后台已确认(顾问可见可改) / published=进行中(客户可见) / finishing=待客户验收 / done=已验收 */
export type PlanPointStatus = 'draft' | 'confirmed' | 'published' | 'finishing' | 'done'

export interface PlanPoint {
  id: number
  analysis_id: number | null
  seq: number
  title: string | null
  content: string | null
  status: PlanPointStatus
  customer_summary?: string | null
  published_by?: string | null
  published_at?: string | null
  /** 顾问点「完成节点」的时间（待客户验收） */
  finish_requested_at?: string | null
  finished_at?: string | null
  project_id: number
  created_at?: string
  project?: { id: number; name: string } | null
}

/** 节点修改历史（仅服务端可见） */
export interface PlanPointHistory {
  id: number
  plan_point_id: number
  editor: string | null
  old_title?: string | null
  old_content?: string | null
  new_title?: string | null
  new_content?: string | null
  project_id: number
  created_at?: string
}

/* ---------- 沟通反馈（文字/录音双通道） ---------- */

export type CommFeedbackKind = 'text' | 'audio'

/** 转写状态：none 无需转写 / transcribing 转写中 / transcribed 待确认 / failed 失败 */
export type CommTranscribeStatus = 'none' | 'transcribing' | 'transcribed' | 'failed'

/** 整体状态：submitted 已提交待起草 / in_review 回复审核中 / replied 已回复 */
export type CommFeedbackStatus = 'submitted' | 'in_review' | 'replied'

export interface CommFeedback {
  id: number
  kind: CommFeedbackKind
  text_content: string | null
  audio_file?: { url: string; name?: string | null } | null
  audio_url?: string | null
  /** 去噪后的角色分离对话（录音反馈） */
  transcript?: string | null
  recognized_text?: string | null
  /** 客户确认/微调后的最终材料（录音反馈可编辑） */
  final_text?: string | null
  transcribe_status: CommTranscribeStatus
  error_message?: string | null
  status: CommFeedbackStatus
  reply_content?: string | null
  reply_status?: string | null
  current_stage?: number | null
  processing_seconds?: number | null
  finished_at?: string | null
  raw_response?: unknown
  project_id: number
  created_at?: string
}

/* ---------- 音频转写填表 ---------- */

export type AudioRecordStatus = 'uploaded' | 'processing' | 'done' | 'failed'

export interface AudioRecord {
  id: number
  file_name: string | null
  audio_url: string | null
  /** 音频文件实体（Zion FILE 列，含可直接播放的 url） */
  audio_file?: { url: string; name?: string | null; sizeBytes?: number } | null
  file_id: string | null
  /** 角色分离后的对话文本（扣子 dialogue_result） */
  transcript: string | null
  /** 语音识别原文（扣子 recognized_text） */
  recognized_text?: string | null
  /** API 完整原始返回（仅服务端角色可见） */
  raw_response?: unknown
  status: AudioRecordStatus
  error_message: string | null
  /** 处理耗时（秒，完成或失败后落库，供前端展示与后期统计） */
  processing_seconds?: number | null
  /** 处理完成/失败时间 */
  finished_at?: string | null
  project_id: number
  created_at?: string
}

/* ---------- 方案反馈（反馈链接机制，替代旧提问/回复） ---------- */

/** 反馈选项 key */
export type FeedbackOption =
  | 'form_supplement'   // ① 补充表单
  | 'info_supplement'   // ② 方案过程中的补充信息
  | 'execution_issues'  // ③ 执行过程中遇到的问题
  | 'detail_request'    // ④ 方案中需要再具体陈述的细节
  | 'result_feedback'   // ⑤ 执行后的反馈结果

export type FeedbackLinkStatus = 'active' | 'submitted' | 'closed' | 'done'

export interface FeedbackLink {
  id: number
  token: string
  options: FeedbackOption[]
  status: FeedbackLinkStatus
  expires_at: string
  project_id: number
  created_at?: string
  feedback_submissions?: FeedbackSubmission[]
}

export type FeedbackSubmissionStatus = 'submitted' | 'confirmed' | 'replied'

/** 表单补充内容：{ basic: { 字段名: 补充文本 }, detailed: { 字段名: 补充文本 } } */
export type FormSupplement = Record<string, Record<string, string>>

export interface FeedbackSubmission {
  id: number
  form_supplement: FormSupplement | null
  info_supplement: string | null
  execution_issues: string | null
  detail_request: string | null
  result_feedback: string | null
  filler_name: string | null
  filler_contact: string | null
  status: FeedbackSubmissionStatus
  link_id: number
  created_at?: string
  feedback_replies?: FeedbackReply[]
}

export interface FeedbackReply {
  id: number
  version: number
  content: string
  status: ReviewStatus | 'draft' | 'published'
  current_stage: number
  internal_ref?: string | null
  feedback_submission_id: number
  project_id: number
  created_at?: string
}
