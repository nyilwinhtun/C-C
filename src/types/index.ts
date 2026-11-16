export type Theme = 'light' | 'dark'

export type NavItemKey = 'generator' | 'vault' | 'planner'

export interface NavItem {
  key: NavItemKey
  title: string
  url: string
  icon: React.ComponentType<{ size?: number | string; className?: string }>
}

export interface ContentPage {
  key: NavItemKey
  title: string
}