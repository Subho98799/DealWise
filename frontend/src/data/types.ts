export type ReviewStatus = 'pending' | 'done'
export type FormStatus = 'pending' | 'submitted'
export type PaymentStatus = 'pending' | 'received' | 'disputed'
export type DealType = 'review' | 'rating_only' | 'review_photo' | 'review_video' | 'other'

export type Deal = {
  id: string
  client_id: string | null
  product: string
  platform: string | null
  mediator_id: string | null
  mediator_name: string | null
  deal_type: DealType
  date_taken: string
  amount_paid: string
  less_amount: string
  refund_amount: string
  commission: string
  review_deadline: string | null
  refund_form_deadline: string | null
  review_status: ReviewStatus
  form_status: FormStatus
  payment_status: PaymentStatus
  payment_received_on: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type Mediator = { id: string; name: string; contact: string | null; created_at: string; updated_at: string }

export type OutboxOp = {
  seq?: number
  op_id: string
  type: 'deal' | 'mediator'
  op: 'upsert' | 'delete'
  id: string
  client_id?: string
  data: Record<string, unknown>
  client_updated_at: string
  status: 'pending' | 'rejected'
  reason?: string
  label?: string
}

export type Me = {
  id: string
  name: string | null
  email: string
  avatar_url: string | null
  role: 'user' | 'admin'
  alert_days: number
  timezone: string
}
