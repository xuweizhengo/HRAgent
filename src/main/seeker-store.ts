import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type OpportunityStatus = 'saved' | 'contacted' | 'applied' | 'interview' | 'offer' | 'rejected' | 'archived'

export interface SeekerProfile {
  name: string
  headline: string
  location: string
  targetRoles: string[]
  skills: string[]
  salaryExpectation: string
  workPreference: 'onsite' | 'hybrid' | 'remote' | 'flexible'
  summary: string
  resumePath: string
  updatedAt: string
}

export interface JobOpportunity {
  id: string
  platform: 'boss' | 'liepin' | 'other'
  title: string
  company: string
  location: string
  salary: string
  url: string
  description: string
  status: OpportunityStatus
  matchScore: number | null
  matchReason: string
  notes: string
  createdAt: string
  updatedAt: string
}

interface SeekerDataFile {
  version: 1
  profile: SeekerProfile
  opportunities: JobOpportunity[]
}

const EMPTY_PROFILE: SeekerProfile = {
  name: '',
  headline: '',
  location: '',
  targetRoles: [],
  skills: [],
  salaryExpectation: '',
  workPreference: 'flexible',
  summary: '',
  resumePath: '',
  updatedAt: new Date(0).toISOString(),
}

function text(value: unknown, max: number): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new Error('字段格式无效')
  const result = value.trim()
  if (result.length > max) throw new Error(`字段长度不能超过 ${max} 字符`)
  return result
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > maxItems) throw new Error('列表字段格式无效')
  const result = value.map(item => text(item, maxLength)).filter(Boolean)
  return [...new Set(result)]
}

function nextTimestamp(previous?: string): string {
  const prior = previous ? Date.parse(previous) : 0
  return new Date(Math.max(Date.now(), Number.isFinite(prior) ? prior + 1 : Date.now())).toISOString()
}

export class SeekerStore {
  private readonly path: string

  constructor(userData: string) {
    this.path = join(userData, 'jobseeker-data.json')
  }

  private read(): SeekerDataFile {
    if (!existsSync(this.path)) return { version: 1, profile: { ...EMPTY_PROFILE }, opportunities: [] }
    const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<SeekerDataFile>
    if (raw.version !== 1 || !raw.profile || !Array.isArray(raw.opportunities)) throw new Error('求职数据文件格式无效')
    return raw as SeekerDataFile
  }

  private write(file: SeekerDataFile): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 })
    renameSync(temporary, this.path)
  }

  getProfile(): SeekerProfile {
    return { ...this.read().profile }
  }

  saveProfile(value: unknown): SeekerProfile {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('求职档案格式无效')
    const input = value as Record<string, unknown>
    const file = this.read()
    const workPreference = ['onsite', 'hybrid', 'remote', 'flexible'].includes(String(input.workPreference))
      ? input.workPreference as SeekerProfile['workPreference']
      : file.profile.workPreference
    const profile: SeekerProfile = {
      name: text(input.name ?? file.profile.name, 80),
      headline: text(input.headline ?? file.profile.headline, 160),
      location: text(input.location ?? file.profile.location, 120),
      targetRoles: input.targetRoles === undefined ? file.profile.targetRoles : stringList(input.targetRoles, 20, 120),
      skills: input.skills === undefined ? file.profile.skills : stringList(input.skills, 60, 100),
      salaryExpectation: text(input.salaryExpectation ?? file.profile.salaryExpectation, 120),
      workPreference,
      summary: text(input.summary ?? file.profile.summary, 4000),
      resumePath: text(input.resumePath ?? file.profile.resumePath, 500),
      updatedAt: nextTimestamp(file.profile.updatedAt),
    }
    file.profile = profile
    this.write(file)
    return { ...profile }
  }

  listOpportunities(): JobOpportunity[] {
    return this.read().opportunities.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  saveOpportunity(value: unknown): JobOpportunity {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('职位记录格式无效')
    const input = value as Record<string, unknown>
    const title = text(input.title, 160)
    const company = text(input.company, 160)
    if (!title || !company) throw new Error('职位名称和公司不能为空')
    const platform = ['boss', 'liepin', 'other'].includes(String(input.platform)) ? input.platform as JobOpportunity['platform'] : 'other'
    const status = ['saved', 'contacted', 'applied', 'interview', 'offer', 'rejected', 'archived'].includes(String(input.status))
      ? input.status as OpportunityStatus : 'saved'
    const score = input.matchScore === null || input.matchScore === undefined ? null : Number(input.matchScore)
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) throw new Error('匹配分数必须是 0-100 的整数')
    const now = new Date().toISOString()
    const opportunity: JobOpportunity = {
      id: randomUUID(),
      platform,
      title,
      company,
      location: text(input.location, 120),
      salary: text(input.salary, 120),
      url: text(input.url, 1000),
      description: text(input.description, 12000),
      status,
      matchScore: score,
      matchReason: text(input.matchReason, 3000),
      notes: text(input.notes, 3000),
      createdAt: now,
      updatedAt: now,
    }
    const file = this.read()
    file.opportunities.push(opportunity)
    if (file.opportunities.length > 1000) throw new Error('职位记录已达到 1000 条上限')
    this.write(file)
    return opportunity
  }

  updateOpportunity(id: string, expectedUpdatedAt: string, value: unknown): JobOpportunity {
    if (!/^[0-9a-f-]{36}$/iu.test(id) || !expectedUpdatedAt) throw new Error('职位记录版本无效')
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('职位更新格式无效')
    const input = value as Record<string, unknown>
    const file = this.read()
    const index = file.opportunities.findIndex(item => item.id === id)
    if (index < 0) throw new Error('职位记录不存在')
    const current = file.opportunities[index]
    if (current.updatedAt !== expectedUpdatedAt) throw new Error('职位记录已变化，请刷新后重试')
    const status = input.status === undefined ? current.status
      : ['saved', 'contacted', 'applied', 'interview', 'offer', 'rejected', 'archived'].includes(String(input.status))
        ? input.status as OpportunityStatus : (() => { throw new Error('申请状态无效') })()
    const score = input.matchScore === undefined ? current.matchScore
      : input.matchScore === null ? null : Number(input.matchScore)
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) throw new Error('匹配分数必须是 0-100 的整数')
    const updated: JobOpportunity = {
      ...current,
      title: input.title === undefined ? current.title : text(input.title, 160),
      company: input.company === undefined ? current.company : text(input.company, 160),
      location: input.location === undefined ? current.location : text(input.location, 120),
      salary: input.salary === undefined ? current.salary : text(input.salary, 120),
      url: input.url === undefined ? current.url : text(input.url, 1000),
      description: input.description === undefined ? current.description : text(input.description, 12000),
      status,
      matchScore: score,
      matchReason: input.matchReason === undefined ? current.matchReason : text(input.matchReason, 3000),
      notes: input.notes === undefined ? current.notes : text(input.notes, 3000),
      updatedAt: nextTimestamp(current.updatedAt),
    }
    if (!updated.title || !updated.company) throw new Error('职位名称和公司不能为空')
    file.opportunities[index] = updated
    this.write(file)
    return updated
  }
}
