import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { boot, healProfilesModuleFallback, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { SessionId } from '@deepseek-ai/dsh-session'
import { prepareDshProfile } from '../dist/main/dsh-profile.js'

const home = mkdtempSync(join(tmpdir(), 'agenthr-agent-tools-'))
const oldHome = process.env.DSH_HOME
process.env.DSH_HOME = home
let ctx
let handle

try {
  const profileDir = join(home, 'profiles', 'spec')
  mkdirSync(profileDir, { recursive: true })
  const config = join(profileDir, 'cordis.yml')
  writeFileSync(config, '[]\n')
  const settings = join(home, 'settings.yaml')
  writeFileSync(settings, '{}\n')
  const installAnchor = resolve('node_modules/@deepseek-ai/dsh/package.json')
  const patch = prepareDshProfile(home, resolve('dist/plugin/index.js'))
  await healProfilesModuleFallback({ installAnchor, home })
  const patches = [
    ...loadOverlayPatches('agenthr-smoke', resolve('node_modules/@deepseek-ai/dsh-base/cordis.patch.yml')),
    ...loadOverlayPatches('agenthr-smoke', resolve('node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml')),
    { id: 'settings', config: { path: settings, watch: false } },
    { id: 'storage-json', config: { root: join(home, 'storages') } },
    { id: 'session-persistence-jsonl', config: { root: join(home, 'sessions') } },
    { id: 'webserver', disabled: true },
    { id: 'web-runtime', disabled: true },
    { id: 'session-telemetry-otel', disabled: true },
    { id: 'modules', disabled: true },
    { id: 'connection', disabled: true },
    { id: 'session-log-download', disabled: true },
    { id: 'open-in-app', disabled: true },
    { id: 'client-hmr', disabled: true },
    { id: 'directory-picker', disabled: true },
    { insert: [
      { id: 'directory-picker-browse', name: '@deepseek-ai/dsh-host-directory-picker-browse' },
      { id: 'ui-directory-picker-browse', name: '@deepseek-ai/dsh-client-ui-directory-picker-browse' },
    ] },
    ...loadOverlayPatches('agenthr-smoke', patch),
  ]
  ctx = await boot('agenthr-smoke', config, patches, bootCtx => {
    bootCtx.provide('connection', {
      fetch: { register: () => () => {} },
      rpc: { intercept: () => () => {} },
    })
    provideCmdline(bootCtx, { args: [], exit: () => {} })
  })
  const presets = await ctx.agentPresets.list()
  assert.deepEqual(presets.map(preset => preset.id), ['standard', 'ptc', 'minimal', 'cordis', 'agenthr'])
  handle = await ctx.agents.create({
    sessionId: SessionId('agenthr-smoke'),
    setup: agentCtx => ctx.agentPresets.mount(agentCtx).then(() => undefined),
  })
  const names = ctx.tools.schemas(handle.agent).map(tool => tool.name).sort()
  const expected = process.env.AGENTHR_PRODUCT_MODE === 'jobseeker' ? [
    'jobseeker_browser_action',
    'jobseeker_browser_snapshot',
    'jobseeker_browser_status',
    'jobseeker_get_profile',
    'jobseeker_get_workspace',
    'jobseeker_list_opportunities',
    'jobseeker_open_platform',
    'jobseeker_save_opportunity',
    'jobseeker_save_profile',
    'jobseeker_update_opportunity',
    process.platform === 'win32' ? 'pwsh' : 'bash',
    'edit',
    'glob',
    'grep',
    'read',
    'read_image',
    'write',
  ] : [
    'agenthr_append_task_result',
    'agenthr_browser_action',
    'agenthr_browser_snapshot',
    'agenthr_browser_status',
    'agenthr_browser_visual_diagnosis',
    'agenthr_create_task',
    'agenthr_get_job_brief',
    'agenthr_get_task',
    'agenthr_get_workspace',
    'agenthr_greet_qualified_boss_candidate',
    'agenthr_list_candidates',
    'agenthr_list_tasks',
    'agenthr_list_visible_candidates',
    'agenthr_open_candidate_preview',
    'agenthr_open_recommendations',
    'agenthr_read_open_resume',
    'agenthr_record_skill_step',
    'agenthr_save_assessment_draft',
    'agenthr_save_job_brief',
    'agenthr_save_visible_candidates',
    'agenthr_update_candidate',
    process.platform === 'win32' ? 'pwsh' : 'bash',
    'edit',
    'glob',
    'grep',
    'read',
    'read_image',
    'write',
  ]
  assert.deepEqual(names, expected.sort())
  process.stdout.write(`${process.env.AGENTHR_PRODUCT_MODE === 'jobseeker' ? 'JobPilot' : 'AgentHR'} preset exposes ${names.length} tools.\n`)
} finally {
  await handle?.dispose()
  await ctx?.fiber.dispose()
  if (oldHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = oldHome
  rmSync(home, { recursive: true, force: true })
}
