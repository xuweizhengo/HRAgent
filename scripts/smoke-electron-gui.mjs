import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const rootManifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
const productName = rootManifest.build?.productName ?? rootManifest.productName ?? rootManifest.name
const linuxExecutable = rootManifest.build?.executableName ?? rootManifest.name
const executables = {
  darwin: `release/mac/${productName}.app/Contents/MacOS/${productName}`,
  win32: `release/win-unpacked/${productName}.exe`,
  linux: `release/linux-unpacked/${linuxExecutable}`,
}
const path = executables[process.platform]
if (!path) throw new Error(`No GUI smoke layout for ${process.platform}`)
const home = mkdtempSync(join(tmpdir(), 'agenthr-gui-smoke-'))
const env = { ...process.env, AGENTHR_OFFLINE_SMOKE: '1', AGENTHR_OFFLINE_HOME: home }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(resolve(path), [], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
let timeoutId
child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-5000) })
child.stderr.on('data', chunk => { output = (output + chunk.toString()).slice(-5000) })

try {
  const result = await Promise.race([
    new Promise((resolveExit, reject) => {
      child.once('error', reject)
      child.once('close', code => resolveExit({ code }))
    }),
    new Promise(resolveTimeout => { timeoutId = setTimeout(() => resolveTimeout({ timeout: true }), 30_000) }),
  ])
  clearTimeout(timeoutId)
  if ('timeout' in result) {
    child.kill('SIGKILL')
    await new Promise(resolveClose => child.once('close', resolveClose))
    throw new Error(`Packaged offline GUI did not finish within 30s: ${output.slice(-1000)}`)
  }
  assert.equal(result.code, 0, output.slice(-1200))
  assert.match(output, /JOBPILOT_OFFLINE_SMOKE_OK/u)
  process.stdout.write('Packaged JobPilot window, renderer, preload bridge, and isolated seeker storage verified without opening job sites.\n')
} finally {
  clearTimeout(timeoutId)
  if (child.exitCode === null) child.kill('SIGKILL')
  rmSync(home, { recursive: true, force: true })
}
