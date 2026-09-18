# JobPilot MVP

JobPilot is a job-seeker product built on the HRAgent Electron + DSH + CDP runtime.

## Product flow

1. Maintain a local seeker profile with target roles, skills, location, salary preference and resume path.
2. Open BOSS or Liepin in the embedded browser.
3. Ask the DSH agent to search and inspect job descriptions.
4. Compare job requirements only against evidence in the local seeker profile/resume.
5. Save promising jobs locally with match score and rationale.
6. Track each opportunity through saved, contacted, applied, interview, offer, rejected or archived.

External-impact actions such as applying, sending messages, uploading a resume or changing a public profile require explicit user authorization.

## JobPilot agent tools

Product/domain tools:
- jobseeker_get_profile
- jobseeker_save_profile
- jobseeker_list_opportunities
- jobseeker_save_opportunity
- jobseeker_update_opportunity
- jobseeker_get_workspace
- jobseeker_open_platform
- jobseeker_browser_status
- jobseeker_browser_snapshot
- jobseeker_browser_action

DSH also keeps its standard local read/search/edit/shell tools. JobPilot's product prompt restricts those tools to user-requested job-search work and excludes unrelated private data.

## Local data

The desktop app uses a separate Electron identity and session:
- user data: `%APPDATA%\JobPilot`
- seeker database: `%APPDATA%\JobPilot\jobseeker-data.json`
- BOSS/Liepin sessions use `persist:jobpilot-*`
- DSH session uses `persist:jobpilot-dsh`

This is isolated from the original AgentHR installation.

## Development

```powershell
pnpm install
pnpm build
pnpm dev
```

Validation used for this MVP:
- TypeScript main/plugin/renderer typecheck
- 54/54 Node tests
- AgentHR compatibility smoke: 28 tools
- JobPilot tool smoke: 17 tools (10 product/browser + 7 standard local tools)
- Windows unpacked package build
- packaged DSH runtime verification
- packaged DSH Host authenticated-page smoke
- packaged JobPilot offline GUI/preload/profile/opportunity smoke

On the current Windows development machine the normal node-pty native rebuild requires Visual Studio Spectre-mitigated C++ libraries, so the validated local directory package was produced with the existing Windows prebuilds and `npmRebuild=false`.
