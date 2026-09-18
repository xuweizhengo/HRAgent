import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { SeekerStore } from '../dist/main/seeker-store.js'

test('seeker profile and opportunity pipeline persist locally with optimistic updates', () => {
  const home = mkdtempSync(join(tmpdir(), 'jobpilot-seeker-'))
  try {
    const store = new SeekerStore(home)
    const initial = store.getProfile()
    assert.equal(initial.name, '')
    const profile = store.saveProfile({
      name: '测试用户',
      targetRoles: ['AI 产品经理', 'Agent 产品经理'],
      skills: ['LLM', 'RAG', '产品设计'],
      location: '上海',
      salaryExpectation: '30-50K',
      workPreference: 'hybrid',
      summary: '负责 AI 产品从 0 到 1。',
    })
    assert.equal(profile.name, '测试用户')
    assert.deepEqual(profile.targetRoles, ['AI 产品经理', 'Agent 产品经理'])

    const job = store.saveOpportunity({
      platform: 'boss', title: 'AI 产品经理', company: '示例科技', location: '上海', salary: '35-50K',
      url: 'https://www.zhipin.com/job_detail/example', description: '负责 Agent 产品',
      matchScore: 86, matchReason: '目标岗位和核心技能匹配',
    })
    assert.equal(job.status, 'saved')
    assert.equal(store.listOpportunities().length, 1)

    const applied = store.updateOpportunity(job.id, job.updatedAt, { status: 'applied', notes: '已投递，等待回复' })
    assert.equal(applied.status, 'applied')
    assert.equal(applied.notes, '已投递，等待回复')
    assert.throws(() => store.updateOpportunity(job.id, job.updatedAt, { status: 'interview' }), /已变化/)

    const reopened = new SeekerStore(home)
    assert.equal(reopened.getProfile().name, '测试用户')
    assert.equal(reopened.listOpportunities()[0].status, 'applied')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
