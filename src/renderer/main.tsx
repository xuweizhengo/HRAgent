import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowClockwise, ArrowsInSimple, ArrowsOutSimple, Briefcase, Browsers, ChatCircleDots,
  CheckCircle, FileText, FolderOpen, GearSix, ListChecks, MagnifyingGlass, Plus,
  SidebarSimple, Sparkle, UserList, WarningCircle, X,
} from '@phosphor-icons/react'
import './style.css'

type NavId = 'chat' | 'profile' | 'opportunities' | 'applications' | 'platforms' | 'settings'
type Platform = 'boss' | 'liepin'
type BrowserMode = 'collapsed' | 'split' | 'fullscreen'
type OpportunityStatus = JobOpportunity['status']

const navItems = [
  { id: 'chat' as const, label: 'AI 求职助手', icon: ChatCircleDots },
  { id: 'profile' as const, label: '我的档案', icon: UserList },
  { id: 'opportunities' as const, label: '职位机会', icon: Briefcase },
  { id: 'applications' as const, label: '申请进度', icon: ListChecks },
  { id: 'platforms' as const, label: '求职平台', icon: Browsers },
  { id: 'settings' as const, label: '设置', icon: GearSix },
]

const pageMeta: Record<NavId, { title: string; subtitle: string }> = {
  chat: { title: 'AI 求职助手', subtitle: '让 Agent 帮你搜职位、读 JD、做匹配分析，并把值得关注的机会保存下来。' },
  profile: { title: '我的求职档案', subtitle: '你的目标岗位、技能、地点、薪资和简历，是职位匹配的唯一事实基础。' },
  opportunities: { title: '职位机会', subtitle: '集中管理 Agent 找到或你手动保存的职位，并持续补充匹配理由。' },
  applications: { title: '申请进度', subtitle: '从已收藏到沟通、投递、面试、Offer，记录每个机会的下一步。' },
  platforms: { title: '求职平台', subtitle: '打开 BOSS 直聘或猎聘求职侧页面，Agent 与你共享同一个浏览器会话。' },
  settings: { title: '本机设置', subtitle: '查看 DSH、工作目录、浏览器控制权和本地数据边界。' },
}

const statusLabel: Record<OpportunityStatus, string> = {
  saved: '已收藏', contacted: '已沟通', applied: '已投递', interview: '面试中',
  offer: 'Offer', rejected: '未通过', archived: '已归档',
}

const emptyProfile: SeekerProfile = {
  name: '', headline: '', location: '', targetRoles: [], skills: [], salaryExpectation: '',
  workPreference: 'flexible', summary: '', resumePath: '', updatedAt: new Date(0).toISOString(),
}

function App() {
  const [status, setStatus] = useState<AgentHrStatus>({})
  const [profile, setProfile] = useState<SeekerProfile>(emptyProfile)
  const [draft, setDraft] = useState<SeekerProfile>(emptyProfile)
  const [opportunities, setOpportunities] = useState<JobOpportunity[]>([])
  const [activeNav, setActiveNav] = useState<NavId>('chat')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [manual, setManual] = useState({ title: '', company: '', location: '', salary: '' })

  const shell = status.shell ?? {
    browserMode: 'collapsed' as const, rightTab: 'browser' as const, browserControl: 'agent' as const,
    workspaceTab: 'chat' as const, navWidth: 216, navCollapsed: false, rightWidth: 520,
  }
  const browserMode = shell.browserMode
  const platform = status.browser?.platform ?? 'boss'
  const dshPhase = status.dsh?.phase ?? 'unconfigured'
  const dshText = { unconfigured: '未配置', starting: '启动中', ready: '已连接', stopped: '已停止', failed: '连接失败' }[dshPhase]
  const page = pageMeta[activeNav]

  async function refreshSeeker() {
    const [nextProfile, nextOpportunities] = await Promise.all([
      window.agenthr.getSeekerProfile(),
      window.agenthr.listOpportunities(),
    ])
    setProfile(nextProfile)
    setDraft(nextProfile)
    setOpportunities(nextOpportunities)
  }

  useEffect(() => {
    void window.agenthr.getStatus().then(setStatus).catch(e => setError(String(e)))
    void refreshSeeker().catch(e => setError(String(e)))
    const stopStatus = window.agenthr.onStatus(setStatus)
    const stopSeeker = window.agenthr.onSeekerChanged(() => void refreshSeeker().catch(e => setError(String(e))))
    return () => { stopStatus(); stopSeeker() }
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  async function navigate(id: NavId) {
    setActiveNav(id)
    await window.agenthr.setWorkspaceTab(id === 'chat' ? 'chat' : 'workspace')
  }

  async function prompt(text: string) {
    await navigate('chat')
    await window.agenthr.insertDshPrompt(text)
  }

  async function openPlatform(next: Platform) {
    await window.agenthr.selectPlatform(next)
    await window.agenthr.setRightTab('browser')
    await window.agenthr.setBrowserMode('split')
    await window.agenthr.openPage('recommend')
  }

  async function saveProfile() {
    const saved = await window.agenthr.saveSeekerProfile(draft)
    setProfile(saved); setDraft(saved)
  }

  async function pickResume() {
    const files = await window.agenthr.pickFiles()
    if (!files[0]) return
    const saved = await window.agenthr.saveSeekerProfile({ resumePath: files[0].path })
    setProfile(saved); setDraft(saved)
  }

  async function moveOpportunity(item: JobOpportunity, next: OpportunityStatus) {
    const saved = await window.agenthr.updateOpportunity(item.id, item.updatedAt, { status: next })
    setOpportunities(current => current.map(value => value.id === saved.id ? saved : value))
  }

  async function addManualOpportunity() {
    if (!manual.title.trim() || !manual.company.trim()) throw new Error('请填写职位名称和公司')
    await window.agenthr.saveOpportunity({ ...manual, platform: 'other', status: 'saved' })
    setManual({ title: '', company: '', location: '', salary: '' })
  }

  const filtered = useMemo(() => {
    const key = query.trim().toLowerCase()
    if (!key) return opportunities
    return opportunities.filter(item => [item.title, item.company, item.location, item.salary, item.matchReason]
      .some(value => value.toLowerCase().includes(key)))
  }, [opportunities, query])

  const activeApplications = opportunities.filter(item => !['saved', 'archived'].includes(item.status))
  const stats = {
    saved: opportunities.filter(item => item.status === 'saved').length,
    active: activeApplications.filter(item => !['rejected', 'offer'].includes(item.status)).length,
    interviews: opportunities.filter(item => item.status === 'interview').length,
    offers: opportunities.filter(item => item.status === 'offer').length,
  }

  const workspaceStyle = browserMode === 'split' ? { marginRight: shell.rightWidth } : undefined
  const panelStyle = browserMode === 'split'
    ? { width: shell.rightWidth }
    : browserMode === 'fullscreen'
      ? { left: shell.navWidth, width: `calc(100vw - ${shell.navWidth}px)` }
      : undefined

  return <div className={`app-shell browser-${browserMode}`} style={{ '--nav-width': `${shell.navWidth}px` } as React.CSSProperties}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Sparkle weight="fill" /></span><div><strong>JobPilot</strong><small>Agent 求职工作台</small></div></div>
      <nav>{navItems.map(item => <button key={item.id} className={activeNav === item.id ? 'active' : ''} onClick={() => void run(() => navigate(item.id))}>
        <item.icon size={19} weight={activeNav === item.id ? 'fill' : 'regular'} /><span>{item.label}</span>
        {item.id === 'opportunities' && opportunities.length > 0 && <b>{opportunities.length}</b>}
      </button>)}</nav>
      <div className="sidebar-actions">
        <button className="primary-action" disabled={busy || dshPhase !== 'ready'} onClick={() => void run(() => prompt('读取我的求职档案，然后在当前求职平台搜索匹配职位。先只浏览和分析，不要投递或发送消息；把明显值得关注的职位保存到本地职位机会。'))}>
          <MagnifyingGlass size={17} />AI 找职位
        </button>
      </div>
      <div className="runtime"><span className={`dot ${dshPhase}`} /><div><strong>DSH {dshText}</strong><small>{profile.targetRoles[0] || '尚未设置目标岗位'}</small></div></div>
    </aside>

    <header className="topbar">
      <div><strong>{page.title}</strong><span>{page.subtitle}</span></div>
      <div className="top-actions">
        {error && <button className="error-pill" title={error} onClick={() => setError('')}><WarningCircle size={16} />{error.slice(0, 30)}<X size={13} /></button>}
        <button className={browserMode !== 'collapsed' ? 'icon-button active' : 'icon-button'} title="求职浏览器" onClick={() => void run(async () => {
          if (browserMode === 'collapsed') { await window.agenthr.setRightTab('browser'); await window.agenthr.setBrowserMode('split') }
          else await window.agenthr.setBrowserMode('collapsed')
        })}><SidebarSimple size={20} /></button>
      </div>
    </header>

    <main className="workspace" style={workspaceStyle}>
      {activeNav === 'chat' && dshPhase !== 'ready' && <EmptyChat phase={dshPhase} onRestart={() => void run(() => window.agenthr.restartDsh())} />}
      {activeNav === 'profile' && <ProfilePage draft={draft} setDraft={setDraft} busy={busy} onSave={() => void run(saveProfile)} onPickResume={() => void run(pickResume)} />}
      {activeNav === 'opportunities' && <OpportunityPage items={filtered} query={query} setQuery={setQuery} manual={manual} setManual={setManual}
        onAdd={() => void run(addManualOpportunity)} onMove={(item, next) => void run(() => moveOpportunity(item, next))}
        onAsk={(item) => void run(() => prompt(`分析我保存的职位「${item.company} - ${item.title}」。先读取我的求职档案，再结合职位信息总结匹配点、缺口和下一步建议；不要自动投递。`))} />}
      {activeNav === 'applications' && <ApplicationPage items={activeApplications} stats={stats} onMove={(item, next) => void run(() => moveOpportunity(item, next))} />}
      {activeNav === 'platforms' && <PlatformPage status={status} platform={platform} busy={busy} onOpen={next => void run(() => openPlatform(next))}
        onControl={control => void run(() => window.agenthr.setBrowserControl(control))} onReload={() => void run(() => window.agenthr.reloadPage())} />}
      {activeNav === 'settings' && <SettingsPage status={status} onWorkspace={() => void run(async () => { await window.agenthr.chooseWorkspace() })}
        onRestart={() => void run(() => window.agenthr.restartDsh())} />}
    </main>

    {browserMode !== 'collapsed' && <aside className="browser-panel" style={panelStyle}>
      <div className="browser-toolbar">
        <div className="platform-tabs">
          <button className={platform === 'boss' ? 'active' : ''} onClick={() => void run(() => openPlatform('boss'))}>BOSS</button>
          <button className={platform === 'liepin' ? 'active' : ''} onClick={() => void run(() => openPlatform('liepin'))}>猎聘</button>
        </div>
        <span className="browser-title">{status.browser?.title || '求职浏览器'}</span>
        <button className="icon-button" title="刷新" onClick={() => void run(() => window.agenthr.reloadPage())}><ArrowClockwise size={17} /></button>
        <button className="icon-button" title={browserMode === 'fullscreen' ? '退出专注' : '专注浏览器'} onClick={() => void run(() => window.agenthr.setBrowserMode(browserMode === 'fullscreen' ? 'split' : 'fullscreen'))}>
          {browserMode === 'fullscreen' ? <ArrowsInSimple size={17} /> : <ArrowsOutSimple size={17} />}
        </button>
        <button className="icon-button" title="收起" onClick={() => void run(() => window.agenthr.setBrowserMode('collapsed'))}><X size={17} /></button>
      </div>
    </aside>}
  </div>
}

function EmptyChat({ phase, onRestart }: { phase: string; onRestart: () => void }) {
  return <div className="empty-chat"><div className="hero-orb"><Sparkle size={34} weight="fill" /></div><h1>你的 AI 求职助手正在准备</h1>
    <p>连接 DSH 后，你可以直接说“帮我找上海 30–50K 的 AI 产品岗位，先分析不要投递”。</p>
    {phase === 'failed' && <button className="primary-button" onClick={onRestart}>重新启动 DSH</button>}</div>
}

function ProfilePage({ draft, setDraft, busy, onSave, onPickResume }: { draft: SeekerProfile; setDraft: React.Dispatch<React.SetStateAction<SeekerProfile>>; busy: boolean; onSave: () => void; onPickResume: () => void }) {
  const field = (key: keyof SeekerProfile, value: unknown) => setDraft(current => ({ ...current, [key]: value }))
  return <div className="content-scroll">
    <section className="hero-card"><div><span className="eyebrow">PERSONAL CONTEXT</span><h1>{draft.name || '建立你的求职档案'}</h1><p>{draft.headline || '让 Agent 只根据你真实提供的经历和偏好判断职位匹配。'}</p></div>
      <button className="secondary-button" onClick={onPickResume}><FileText size={17} />{draft.resumePath ? '更换简历' : '导入简历'}</button></section>
    <section className="form-card">
      <div className="grid two"><label>姓名<input value={draft.name} onChange={e => field('name', e.target.value)} placeholder="你的姓名" /></label>
        <label>当前定位<input value={draft.headline} onChange={e => field('headline', e.target.value)} placeholder="例如：AI 产品经理 / 7 年互联网经验" /></label></div>
      <div className="grid two"><label>期望地点<input value={draft.location} onChange={e => field('location', e.target.value)} placeholder="上海 / 杭州 / 远程" /></label>
        <label>期望薪资<input value={draft.salaryExpectation} onChange={e => field('salaryExpectation', e.target.value)} placeholder="例如 30-50K·14薪" /></label></div>
      <label>目标岗位<input value={draft.targetRoles.join('、')} onChange={e => field('targetRoles', e.target.value.split(/[、,，\n]/u).map(v => v.trim()).filter(Boolean))} placeholder="AI 产品经理、Agent 产品经理" /></label>
      <label>核心技能<input value={draft.skills.join('、')} onChange={e => field('skills', e.target.value.split(/[、,，\n]/u).map(v => v.trim()).filter(Boolean))} placeholder="LLM、RAG、产品设计、数据分析…" /></label>
      <div className="grid two"><label>工作方式<select value={draft.workPreference} onChange={e => field('workPreference', e.target.value)}>
        <option value="flexible">不限</option><option value="onsite">坐班</option><option value="hybrid">混合办公</option><option value="remote">远程</option>
      </select></label><label>简历文件<input value={draft.resumePath} onChange={e => field('resumePath', e.target.value)} placeholder="工作目录中的简历路径" /></label></div>
      <label>经历摘要<textarea rows={7} value={draft.summary} onChange={e => field('summary', e.target.value)} placeholder="写下你希望 Agent 在匹配职位时知道的真实经历、项目、优势和限制。" /></label>
      <div className="form-footer"><span>所有内容仅保存在本机。</span><button className="primary-button" disabled={busy} onClick={onSave}><CheckCircle size={17} />保存档案</button></div>
    </section>
  </div>
}

function OpportunityPage(p: { items: JobOpportunity[]; query: string; setQuery: (v: string) => void; manual: { title: string; company: string; location: string; salary: string }; setManual: React.Dispatch<React.SetStateAction<{ title: string; company: string; location: string; salary: string }>>; onAdd: () => void; onMove: (item: JobOpportunity, status: OpportunityStatus) => void; onAsk: (item: JobOpportunity) => void }) {
  return <div className="content-scroll">
    <div className="section-tools"><div className="search-box"><MagnifyingGlass size={17} /><input value={p.query} onChange={e => p.setQuery(e.target.value)} placeholder="搜索职位、公司、地点…" /></div>
      <span>{p.items.length} 个职位</span></div>
    <div className="opportunity-grid">{p.items.map(item => <article className="job-card" key={item.id}>
      <div className="job-head"><div><span className="company">{item.company}</span><h3>{item.title}</h3></div>{item.matchScore !== null && <div className="score">{item.matchScore}<small>%</small></div>}</div>
      <div className="job-meta"><span>{item.location || '地点未知'}</span><span>{item.salary || '薪资面议'}</span><span className={`stage ${item.status}`}>{statusLabel[item.status]}</span></div>
      {item.matchReason && <p className="match-reason">{item.matchReason}</p>}
      <div className="job-actions"><button onClick={() => p.onAsk(item)}>让 AI 分析</button><select value={item.status} onChange={e => p.onMove(item, e.target.value as OpportunityStatus)}>
        {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></div>
    </article>)}</div>
    {!p.items.length && <div className="empty-list"><Briefcase size={34} /><h3>还没有职位机会</h3><p>去 AI 求职助手说“帮我找职位”，或者先手动添加一个。</p></div>}
    <section className="manual-card"><div><span className="eyebrow">QUICK ADD</span><h3>手动添加职位</h3></div><div className="grid four">
      {(['title','company','location','salary'] as const).map((key, index) => <input key={key} value={p.manual[key]} onChange={e => p.setManual(v => ({ ...v, [key]: e.target.value }))} placeholder={['职位名称','公司','地点','薪资'][index]} />)}
      <button className="secondary-button" onClick={p.onAdd}><Plus size={16} />添加</button></div></section>
  </div>
}

function ApplicationPage({ items, stats, onMove }: { items: JobOpportunity[]; stats: { saved: number; active: number; interviews: number; offers: number }; onMove: (item: JobOpportunity, status: OpportunityStatus) => void }) {
  const stages: OpportunityStatus[] = ['contacted', 'applied', 'interview', 'offer', 'rejected']
  return <div className="content-scroll"><div className="stat-grid">
    <Stat label="待跟进" value={stats.active} /><Stat label="面试中" value={stats.interviews} /><Stat label="Offer" value={stats.offers} /><Stat label="已收藏" value={stats.saved} />
  </div><div className="pipeline">{stages.map(stage => <section className="pipeline-column" key={stage}><header><strong>{statusLabel[stage]}</strong><span>{items.filter(i => i.status === stage).length}</span></header>
    {items.filter(i => i.status === stage).map(item => <div className="pipeline-card" key={item.id}><b>{item.title}</b><span>{item.company}</span><small>{item.salary || item.location}</small>
      <select value={item.status} onChange={e => onMove(item, e.target.value as OpportunityStatus)}>{Object.entries(statusLabel).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>)}</section>)}</div></div>
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div> }

function PlatformPage({ status, platform, busy, onOpen, onControl, onReload }: { status: AgentHrStatus; platform: Platform; busy: boolean; onOpen: (p: Platform) => void; onControl: (c: 'agent' | 'human') => void; onReload: () => void }) {
  return <div className="content-scroll narrow"><section className="hero-card"><div><span className="eyebrow">JOB SITES</span><h1>打开求职平台</h1><p>登录由你完成；登录后 Agent 可以读取页面和操作普通搜索控件，但投递、发消息和上传简历仍需要你的明确授权。</p></div></section>
    <div className="platform-grid"><button className={`platform-card ${platform === 'boss' ? 'active' : ''}`} disabled={busy} onClick={() => onOpen('boss')}><strong>BOSS 直聘</strong><span>职位搜索 · 沟通 · 投递</span></button>
      <button className={`platform-card ${platform === 'liepin' ? 'active' : ''}`} disabled={busy} onClick={() => onOpen('liepin')}><strong>猎聘</strong><span>中高端职位搜索 · 职位详情</span></button></div>
    <section className="form-card"><div className="setting-row"><div><b>浏览器控制权</b><p>Agent 模式下屏蔽手工点击；需要登录或人工操作时切到“我来操作”。</p></div>
      <div className="segmented"><button className={status.shell?.browserControl === 'agent' ? 'active' : ''} onClick={() => onControl('agent')}>Agent</button><button className={status.shell?.browserControl === 'human' ? 'active' : ''} onClick={() => onControl('human')}>我来操作</button></div></div>
      <div className="setting-row"><div><b>当前页面</b><p>{status.browser?.url || '尚未打开平台'}</p></div><button className="secondary-button" onClick={onReload}><ArrowClockwise size={16} />刷新</button></div></section></div>
}

function SettingsPage({ status, onWorkspace, onRestart }: { status: AgentHrStatus; onWorkspace: () => void; onRestart: () => void }) {
  return <div className="content-scroll narrow"><section className="form-card"><div className="setting-row"><div><b>工作目录</b><p>{status.workspace?.path || '未设置'}</p></div><button className="secondary-button" onClick={onWorkspace}><FolderOpen size={16} />更换</button></div>
    <div className="setting-row"><div><b>DSH Agent Runtime</b><p>{status.dsh?.detail || status.dsh?.phase || '未启动'}</p></div><button className="secondary-button" onClick={onRestart}><ArrowClockwise size={16} />重启</button></div>
    <div className="setting-row"><div><b>数据策略</b><p>求职档案和职位跟踪保存在本机 jobseeker-data.json；网站登录态保留在 Electron 独立 session 中。</p></div></div></section></div>
}

createRoot(document.getElementById('root')!).render(<App />)
