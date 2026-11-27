export type Theme = 'light' | 'dark'

export type NavItemKey =
  | 'text'
  | 'video'
  | 'transcriber'
  | 'voiceover'
  | 'audiobook'
  | 'studio'
  | 'presenter3d'
  | 'socialQr'
  | 'vault'

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

export type BusinessCategory =
  | 'general'
  | 'education'
  | 'vlog'
  | 'tech_review'
  | 'motivation'
  | 'online_shop'
  | 'custom'

export interface BusinessCategoryOption {
  value: BusinessCategory
  label: string
  labelMy: string
}

export const BUSINESS_CATEGORIES: readonly BusinessCategoryOption[] = [
  { value: 'general', label: 'General Creator / All-Purpose', labelMy: 'အထွေထွေ ကွန်တင့်ဖန်တီးသူ' },
  { value: 'education', label: 'Education & How-To Tips', labelMy: 'ပညာပေးနှင့် နည်းလမ်းများ' },
  { value: 'vlog', label: 'Vlog, Travel & Lifestyle', labelMy: 'Vlog၊ ခရီးသွားနှင့် လူနေမှုပုံစံ' },
  { value: 'tech_review', label: 'Tech & Product Review', labelMy: 'နည်းပညာနှင့် ပစ္စည်းသုံးသပ်ချက်' },
  { value: 'motivation', label: 'Motivation & Storytelling', labelMy: 'စိတ်ဓာတ်ခွန်အားနှင့် ပုံပြင်ပြောခြင်း' },
  { value: 'online_shop', label: 'Online Shop & E-Commerce', labelMy: 'အွန်လိုင်းဆိုင်နှင့် အရောင်း' },
  { value: 'custom', label: 'Custom Niche...', labelMy: 'ကိုယ်ပိုင် Niche ထည့်မည်...' },
] as const

export function isShoppingCategory(category?: BusinessCategory | string | null): boolean {
  return category === 'online_shop'
}

export function normalizeBusinessCategory(value?: string | null): BusinessCategory {
  switch (value) {
    case 'general':
    case 'education':
    case 'vlog':
    case 'tech_review':
    case 'motivation':
    case 'online_shop':
    case 'custom':
      return value
    case 'fashion':
    case 'beauty':
    case 'food':
    case 'electronics':
    case 'home':
      return 'online_shop'
    default:
      return 'general'
  }
}

export type SalesAngle =
  | 'viral_story'
  | 'quick_tips'
  | 'honest_review'
  | 'promo_showcase'
  | 'short_reel'

export type ContentAngle = SalesAngle

export interface SalesAngleOption {
  value: SalesAngle
  label: string
  labelMy: string
}

export const SALES_ANGLES: readonly SalesAngleOption[] = [
  { value: 'viral_story', label: 'Viral Hook & Story (Vlog / General)', labelMy: 'Viral Hook နှင့် ပုံပြင် (Vlog / အထွေထွေ)' },
  { value: 'quick_tips', label: '3 Quick Tips / Educational', labelMy: 'အကြံပြုချက် ၃ ချက် / ပညာပေး' },
  { value: 'honest_review', label: 'Honest Review / Comparison', labelMy: 'ရိုးသားသော သုံးသပ်ချက် / နှိုင်းယှဉ်ချက်' },
  { value: 'promo_showcase', label: 'Promo / Product Showcase', labelMy: 'ပရိုမိုးရှင်း / ပစ္စည်းမိတ်ဆက်' },
  { value: 'short_reel', label: 'Short Punchy Reel (10–15s)', labelMy: 'Reel / TikTok အတို (၁၀-၁၅ စက္ကန့်)' },
] as const

export function normalizeSalesAngle(value?: string | null): SalesAngle {
  switch (value) {
    case 'viral_story':
    case 'quick_tips':
    case 'honest_review':
    case 'promo_showcase':
    case 'short_reel':
      return value
    case 'flash_sale':
      return 'promo_showcase'
    case 'problem_solution':
      return 'quick_tips'
    case 'new_arrival':
    default:
      return 'viral_story'
  }
}

export const DEFAULT_ONLINE_SHOP_CTA_MY =
  '📦 အိမ်အရောက် ငွေချေစနစ် (COD) ဖြင့် မှာယူနိုင်ပါပြီ • Inbox မှတစ်ဆင့် ဆက်သွယ်ပါ'
export const DEFAULT_ONLINE_SHOP_CTA_EN =
  '📦 Cash on Delivery (COD) available • Message our Inbox to order now!'
