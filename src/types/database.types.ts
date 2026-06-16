export type UserRole = 'customer' | 'ops_admin' | 'support' | 'finance' | 'affiliate' | 'super_admin'
export type MembershipTier = 'Free' | 'Plus' | 'Pro' | 'Seller'
export type UserStatus = 'active' | 'suspended'
export type OrderStatus =
  | 'draft' | 'quote_created' | 'waiting_payment' | 'paid'
  | 'procurement_queue' | 'purchased' | 'in_japan_warehouse'
  | 'packed' | 'shipped_to_indonesia' | 'customs_clearance'
  | 'last_mile_delivery' | 'delivered' | 'cancelled' | 'refunded'
export type QuotationStatus = 'active' | 'expired' | 'converted'
export type PaymentStatus = 'settled' | 'pending' | 'failed'
export type PaymentMethod = 'VA BCA' | 'QRIS' | 'VA Mandiri' | 'Credit Card' | 'VA BNI' | 'GoPay' | 'ShopeePay'
export type RefundStatus = 'pending_review' | 'approved' | 'processing' | 'completed'
export type PriorityLevel = 'high' | 'normal' | 'low'
export type SupportChannel = 'Telegram' | 'Email'
export type SupportStatus = 'open' | 'in_progress' | 'resolved'
export type PointsType = 'earn' | 'redeem' | 'expire'
export type BatchStatus = 'draft' | 'open' | 'closing_soon' | 'closed' | 'shipping'
export type AlertStatus = 'monitoring' | 'triggered' | 'paused'
export type AffiliatePayoutStatus = 'pending' | 'approved' | 'paid'
export type PricingType = 'percent' | 'flat'
export type ProcurementStatus = 'pending' | 'purchasing' | 'purchased' | 'failed'

export interface Profile {
  id: string
  name: string
  email: string
  username: string
  role: UserRole
  tier: MembershipTier
  status: UserStatus
  points_balance: number
  avatar_url: string | null
  telegram_token: string | null
  telegram_id: number | null
  created_at: string
  updated_at: string
}

export interface MembershipPlan {
  id: string
  name: MembershipTier
  price_monthly: number
  discount_percent: number
  point_multiplier: number
  priority_procurement: boolean
  features: string[]
  active: boolean
  created_at: string
  updated_at: string
}

export interface UserMembership {
  id: string
  user_id: string
  plan_id: string | null
  tier: MembershipTier
  spent_amount: number
  target_amount: number
  renews_on: string | null
  created_at: string
  updated_at: string
}

export interface Address {
  id: string
  user_id: string
  label: string
  recipient: string
  phone: string
  line: string
  city: string
  postal: string
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface Marketplace {
  id: string
  name: string
  domain: string
  scraper_health: number
  orders_mtd: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface Quotation {
  id: string
  user_id: string
  product: string
  url: string | null
  source: string | null
  price_jpy: number | null
  exchange_rate: number | null
  service_fee: number
  shipping_cost: number
  tax_customs: number
  membership_discount: number
  points_used: number
  total: number
  confidence_score: number | null
  confidence_label: string | null
  price_history: Record<string, unknown>
  assistant_summary: Record<string, unknown>
  status: QuotationStatus
  created_at: string
  expires_at: string
}

export interface QuotationAiAudit {
  id: string
  quotation_id: string
  user_id: string
  input_url: string | null
  input_query: string | null
  input_budget: string | null
  confidence_score: number
  confidence_label: string
  confidence_reasons: unknown[]
  price_history: Record<string, unknown>
  similar_count: number
  estimation_payload: Record<string, unknown>
  created_at: string
}

export interface Order {
  id: string
  user_id: string
  quotation_id: string | null
  address_id: string | null
  product: string
  source: string | null
  price_jpy: number | null
  exchange_rate: number | null
  service_fee: number
  shipping_cost: number
  tax_customs: number
  membership_discount: number
  points_used: number
  total: number
  status: OrderStatus
  tracking_number: string | null
  shipping_route: string | null
  weight_kg: number | null
  notes: string | null
  eta: string | null
  created_at: string
  updated_at: string
}

export interface OrderTracking {
  id: string
  order_id: string
  status: OrderStatus
  note: string | null
  is_done: boolean
  is_current: boolean
  occurred_at: string
  created_at: string
}

export interface Payment {
  id: string
  order_id: string
  user_id: string
  method: PaymentMethod
  amount: number
  status: PaymentStatus
  gateway_ref: string | null
  settled_at: string | null
  created_at: string
}

export interface Refund {
  id: string
  order_id: string
  user_id: string
  payment_id: string | null
  amount: number
  reason: string
  status: RefundStatus
  reviewed_by: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
}

export interface PointsLedger {
  id: string
  user_id: string
  order_id: string | null
  type: PointsType
  amount: number
  balance_after: number
  reference: string | null
  expires_at: string | null
  created_at: string
}

export interface ProcurementQueue {
  id: string
  order_id: string
  user_id: string
  product: string
  source: string
  url: string | null
  price_jpy: number
  qty: number
  priority: PriorityLevel
  assigned_to: string | null
  notes: string | null
  status: ProcurementStatus
  created_at: string
  updated_at: string
}

export interface SupportNote {
  id: string
  user_id: string
  order_id: string | null
  channel: SupportChannel
  note: string
  agent_id: string | null
  status: SupportStatus
  created_at: string
  updated_at: string
}

export interface BatchShipment {
  id: string
  name: string
  route: string
  closes_at: string
  arrives_at: string | null
  capacity: number
  price_per_kg: number
  savings_percent: number
  direction: 'indonesia_to_japan' | 'japan_to_indonesia'
  max_weight_kg: number
  departure_date: string
  status: BatchStatus
  created_at: string
  updated_at: string
}

export interface BatchParticipant {
  id: string
  batch_id: string
  user_id: string
  order_id: string | null
  items: number
  weight_kg: number
  joined_at: string
}

export interface Preorder {
  id: string
  emoji: string
  name: string
  brand: string | null
  release_date: string | null
  retail_jpy: number | null
  estimate_idr: number | null
  dp_idr: number | null
  quota_total: number
  quota_taken: number
  closes_at: string | null
  tag: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface PreorderBooking {
  id: string
  preorder_id: string
  user_id: string
  payment_type: 'dp' | 'full'
  amount_paid: number
  amount_remaining: number
  status: string
  created_at: string
  updated_at: string
}

export interface WishlistItem {
  id: string
  user_id: string
  emoji: string
  name: string
  url: string | null
  price_idr: number | null
  source: string | null
  note: string | null
  created_at: string
}

export interface PriceAlert {
  id: string
  user_id: string
  product: string
  url: string | null
  current_price: number | null
  target_price: number
  status: AlertStatus
  last_checked_at: string | null
  triggered_at: string | null
  created_at: string
}

export interface TrackingException {
  id: string
  order_id: string
  user_id: string
  issue: string
  severity: PriorityLevel
  tracking_number: string | null
  resolved_at: string | null
  created_at: string
}

export interface ScraperFailure {
  id: string
  marketplace_id: string | null
  url: string
  reason: string
  retries: number
  resolved_at: string | null
  created_at: string
}

export interface QuoteApproval {
  id: string
  quotation_id: string
  user_id: string
  reason: string
  reviewed_by: string | null
  approved: boolean | null
  reviewed_at: string | null
  created_at: string
}

export interface PricingRule {
  id: string
  name: string
  type: PricingType
  value: number
  apply_to: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface FeeSetting {
  id: string
  key: string
  value: string
  description: string | null
  updated_by: string | null
  updated_at: string
}

export interface ShippingRoute {
  id: string
  route: string
  price_per_kg: number
  eta: string | null
  min_weight: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface AffiliateCommissionTier {
  id: string
  tier: string
  min_orders: number
  commission_percent: number
  payout_min: number
  created_at: string
}

export interface AffiliatePayout {
  id: string
  user_id: string
  orders_count: number
  commission: number
  status: AffiliatePayoutStatus
  period: string
  approved_by: string | null
  paid_at: string | null
  created_at: string
}

export interface AiSetting {
  id: string
  key: string
  value: string
  description: string | null
  updated_by: string | null
  updated_at: string
}

// Extended types with joins
export interface OrderWithTracking extends Order {
  tracking: OrderTracking[]
}

export interface PaymentWithOrder extends Payment {
  orders: Pick<Order, 'id' | 'product'> | null
  profiles: Pick<Profile, 'id' | 'name'> | null
}

export interface RefundWithDetails extends Refund {
  orders: Pick<Order, 'id' | 'product'> | null
  profiles: Pick<Profile, 'id' | 'name'> | null
}

export interface ProcurementWithUser extends ProcurementQueue {
  profiles: Pick<Profile, 'id' | 'name'> | null
  orders: Pick<Order, 'id' | 'product'> | null
}

export interface SupportNoteWithDetails extends SupportNote {
  profiles: Pick<Profile, 'id' | 'name'> | null
  orders: Pick<Order, 'id'> | null
  agent: Pick<Profile, 'id' | 'name'> | null
}

export interface BatchShipmentWithCount extends BatchShipment {
  participant_count: number
}

// Landing page content tables
export interface Category {
  id: string
  emoji: string
  name: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface Testimonial {
  id: string
  name: string
  city: string
  text: string
  rating: number
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface FAQ {
  id: string
  question: string
  answer: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export type ShopperVerification = 'none' | 'gold' | 'blue'

export interface ShopperStats {
  orders_completed: number
  rating: number
  reviews_count: number
}

export interface PersonalShopper {
  id: string
  name: string
  slug: string
  avatar_url: string | null
  cover_url: string | null
  tagline: string | null
  description: string | null
  verification: ShopperVerification
  services: string[]
  pricing_description: string | null
  starting_price: number | null
  location: string | null
  website: string | null
  social_links: Record<string, string>
  stats: ShopperStats
  is_active: boolean
  featured: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface ShopperReview {
  id: string
  shopper_id: string
  user_id: string
  rating: number
  review: string | null
  created_at: string
}
