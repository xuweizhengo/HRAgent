export const PLATFORMS = {
  boss: {
    name: 'BOSS 直聘',
    domain: 'zhipin.com',
    pages: {
      login: 'https://www.zhipin.com/',
      recommend: 'https://www.zhipin.com/',
      messages: null,
    },
  },
  liepin: {
    name: '猎聘',
    domain: 'liepin.com',
    pages: {
      login: 'https://www.liepin.com/',
      recommend: 'https://www.liepin.com/',
      messages: null,
    },
  },
} as const

export type Platform = keyof typeof PLATFORMS
export type RecruitmentPage = 'login' | 'recommend' | 'messages'

export function isRecruitmentUrl(value: string, platform: Platform): boolean {
  try {
    const url = new URL(value)
    const domain = PLATFORMS[platform].domain
    return url.protocol === 'https:'
      && (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
  } catch {
    return false
  }
}
