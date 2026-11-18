export type Theme = 'light' | 'dark'

export type NavItemKey = 'generator' | 'photo-studio' | 'vault' | 'planner'

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
  | 'fashion'
  | 'beauty'
  | 'food'
  | 'electronics'
  | 'home'

export interface BusinessCategoryOption {
  value: BusinessCategory
  label: string
  labelMy: string
}

export const BUSINESS_CATEGORIES: readonly BusinessCategoryOption[] = [
  { value: 'general', label: 'General Online Shop', labelMy: 'အထွေထွေ အွန်လိုင်းဆိုင်' },
  { value: 'fashion', label: 'Fashion & Apparel', labelMy: 'ဖက်ရှင်နှင့် အဝတ်အထည်' },
  { value: 'beauty', label: 'Beauty & Skincare', labelMy: 'အလှကုန်နှင့် အသားအရေထိန်းသိမ်းမှု' },
  { value: 'food', label: 'Food & Beverage', labelMy: 'အစားအသောက်နှင့် အဖျော်ယမကာ' },
  { value: 'electronics', label: 'Electronics & Gadgets', labelMy: 'အီလက်ထရောနစ်နှင့် Gadget' },
  { value: 'home', label: 'Home & Lifestyle', labelMy: 'အိမ်သုံးပစ္စည်းနှင့် လူနေမှုပုံစံ' },
] as const

export type SalesAngle =
  | 'new_arrival'
  | 'flash_sale'
  | 'problem_solution'
  | 'short_reel'

export interface SalesAngleOption {
  value: SalesAngle
  label: string
  labelMy: string
}

export const SALES_ANGLES: readonly SalesAngleOption[] = [
  { value: 'new_arrival', label: 'New Arrival', labelMy: 'ပစ္စည်းသစ်' },
  { value: 'flash_sale', label: 'Flash Sale / Promo', labelMy: 'အထူးလျှော့ဈေး' },
  { value: 'problem_solution', label: 'Problem-Solution', labelMy: 'ပြဿနာဖြေရှင်း' },
  { value: 'short_reel', label: 'Short Punchy Reel', labelMy: 'Reel / TikTok အတို' },
] as const

export const DEFAULT_ONLINE_SHOP_CTA_MY =
  '📦 အိမ်အရောက် ငွေချေစနစ် (COD) ဖြင့် မှာယူနိုင်ပါပြီ • Inbox မှတစ်ဆင့် ဆက်သွယ်ပါ'
export const DEFAULT_ONLINE_SHOP_CTA_EN =
  '📦 Cash on Delivery (COD) available • Message our Inbox to order now!'
