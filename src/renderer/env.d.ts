import type { YanceDesktopApi } from '../shared/types'

declare global {
  interface Window {
    yance: YanceDesktopApi
  }
}

export {}
