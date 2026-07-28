/**
 * 收集表字段定义
 * 字段清单严格来自《开发文档.md》§5.1（基础版 3 组 15 项）与 §5.2（详细版 7 部分 42 问）
 */

export interface FieldDef {
  key: string
  type: 'input' | 'textarea'
  required?: boolean
  placeholder?: string
}

export interface FieldGroup {
  title: string
  fields: FieldDef[]
}

/** 基础版收集表（3 组 15 项） */
export const BASIC_GROUPS: FieldGroup[] = [
  {
    title: 'A. 基础信息',
    fields: [
      { key: '企业名称', type: 'input', required: true, placeholder: '请输入企业全称' },
      { key: '所属行业（服务/销售/生产/综合一体）', type: 'input', required: true, placeholder: '如：餐饮、零售、制造业…' },
      { key: '经营年限', type: 'input', required: true, placeholder: '如：5 年' },
      { key: '您的职位', type: 'input', required: true, placeholder: '如：创始人、总经理…' },
      { key: '员工人数', type: 'input', required: true, placeholder: '如：15人，3个大厨、2个服务员…' },
      { key: '主要业务城市', type: 'input', required: true, placeholder: '如：西安' },
      { key: '办公面积', type: 'input', required: true, placeholder: '如：200 平米' },
    ],
  },
  {
    title: 'B. 财务模型',
    fields: [
      { key: '年营业额', type: 'input', required: true, placeholder: '如：300万' },
      { key: '产品成本', type: 'textarea', required: true, placeholder: '请描述主要成本构成，如原材料、人工、房租…' },
      { key: '利润', type: 'input', required: true, placeholder: '可填百分比或金额，如：15% 或 50万' },
    ],
  },
  {
    title: 'C. 核心痛点',
    fields: [
      { key: '当前最头疼的三个问题', type: 'textarea', required: true, placeholder: '请尽量具体描述' },
      { key: '尝试过的解决方案及效果如何', type: 'textarea', required: true, placeholder: '尝试过的方法、效果如何' },
      { key: '有什么独特资源', type: 'textarea', required: true, placeholder: '如：渠道、人脉、技术、资质…' },
      { key: '创始人愿景', type: 'textarea', required: true, placeholder: '您希望把企业做成什么样' },
      { key: '创始人决策风格', type: 'textarea', required: true, placeholder: '如：果断型、商量型…' },
    ],
  },
]

export interface DetailedSection {
  title: string
  questions: string[]
}

/** 详细版收集表《企业全面诊断信息收集表》（7 部分 42 问） */
export const DETAILED_SECTIONS: DetailedSection[] = [
  {
    title: '第一部分：企业基本信息',
    questions: [
      '公司全称',
      '成立时间（实际运营时间）',
      '所属行业（服务/销售/生产/综合一体）',
      '行业类别',
      '企业性质（国企/民营/外资/合资）',
      '员工总数',
      '年营业额（近三年均值）',
      '利润情况（近三年均值）',
      '主要办公/生产基地地址',
    ],
  },
  {
    title: '第二部分：战略与定位',
    questions: [
      '企业愿景与使命',
      '未来 3—5 年的战略目标',
      '核心竞争优势',
      '产品定位人群',
      '目标客户年龄段',
      '市场区域',
      '对竞争对手的分析，它的优势及劣势',
      '行业趋势对企业的影响',
    ],
  },
  {
    title: '第三部分：产品与服务',
    questions: [
      '主营产品或服务流程',
      '各产品线营收占比',
      '产品生命周期阶段（客户下一次购买产品的时间段）',
      '客户对产品/服务的评价',
    ],
  },
  {
    title: '第四部分：市场与客户',
    questions: [
      '主要客户群体特征',
      '市场占有率（上升或下降）',
      '销售渠道与分布',
      '品牌知名度与影响力',
      '获取客户成本与留存率',
    ],
  },
  {
    title: '第五部分：人力资源',
    questions: [
      '核心管理层背景（学历，阅历，年限）',
      '关键岗位人才配比度',
      '员工满意度调查结果',
      '专业培训与发展体系是否完善',
      '绩效考核与激励制度匹配度',
      '人才流失率及原因分析',
    ],
  },
  {
    title: '第六部分：财务与资本',
    questions: [
      '主要成本构成',
      '现金流状况',
      '企业债务情况',
      '企业是否有外部资金投入',
      '主要导致财务风险的原因',
      '投资计划与方向',
    ],
  },
  {
    title: '第七部分：存在的问题与挑战',
    questions: [
      '当前最紧迫的三大问题',
      '尝试过的解决方案及效果如何',
      '客户资源与员工能力匹配度',
      '外部环境带来的主要挑战',
      '期望咨询达成的具体目标',
      '其他需要说明的情况',
    ],
  },
]

/** 详细版题目的输入框浅色提示文字（placeholder） */
export const DETAILED_PLACEHOLDERS: Record<string, string> = {
  行业类别: '例如：零售/批发/生产/服务/科技/金融/文化/建筑/医疗',
  企业债务情况: '例如企业未回款或企业本身负债',
}
