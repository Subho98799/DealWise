// Pure business rules. Mirror of backend/app/rules.py — keep both in sync (tests cover both).
import { addDays } from './dates'
import { toPaise } from './money'
import type { Deal } from '../data/types'

export type Action = 'review_done' | 'form_submitted' | 'payment_received' | 'reopen_review' | 'reopen_form' | 'reopen_payment'
export type Urgency = { isUrgent: boolean; isOverdue: boolean; reason: string | null; due: string | null }
type State = Pick<Deal, 'review_status' | 'form_status' | 'payment_status' | 'review_deadline' | 'refund_form_deadline'>

export class RuleError extends Error {}

/** Urgent: a pending step's deadline <= today + alertDays. Overdue: deadline < today (overdue implies urgent). */
export function evaluate(d: State, today: string, alertDays: number): Urgency {
  const horizon = addDays(today, alertDays)
  const hits: [string, string][] = []
  if (d.review_status === 'pending' && d.review_deadline && d.review_deadline <= horizon) hits.push([d.review_deadline, 'review'])
  if (d.form_status === 'pending' && d.refund_form_deadline && d.refund_form_deadline <= horizon) hits.push([d.refund_form_deadline, 'form'])
  if (!hits.length) return { isUrgent: false, isOverdue: false, reason: null, due: null }
  hits.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
  const [due, kind] = hits[0]
  const overdue = due < today
  return { isUrgent: true, isOverdue: overdue, reason: `${kind}_${overdue ? 'overdue' : 'due_soon'}`, due }
}

export const isCompleted = (d: Pick<Deal, 'review_status' | 'form_status' | 'payment_status'>) =>
  d.review_status === 'done' && d.form_status === 'submitted' && d.payment_status === 'received'

export const netPaise = (d: Pick<Deal, 'less_amount' | 'commission'>) =>
  toPaise(d.commission) - toPaise(d.less_amount)

export function nextAction(d: Deal): Action | null {
  if (d.review_status === 'pending') return 'review_done'
  if (d.form_status === 'pending') return 'form_submitted'
  if (d.payment_status !== 'received') return 'payment_received'
  return null
}

export const ACTION_LABEL: Record<Action, string> = {
  review_done: 'Review done', form_submitted: 'Form submitted', payment_received: 'Payment received',
  reopen_review: 'Reopen review', reopen_form: 'Reopen form', reopen_payment: 'Reopen payment',
}

export function applyAction(d: Deal, action: Action, today: string): Partial<Deal> {
  const bad = (m: string) => { throw new RuleError(m) }
  switch (action) {
    case 'review_done':
      if (d.review_status !== 'pending') bad('Review is already done.')
      return { review_status: 'done' }
    case 'form_submitted':
      if (d.form_status !== 'pending') bad('Refund form is already submitted.')
      if (d.review_status !== 'done') bad('Mark the review done before submitting the refund form.')
      return { form_status: 'submitted' }
    case 'payment_received':
      if (d.payment_status === 'received') bad('Payment is already received.')
      if (d.form_status !== 'submitted') bad('Submit the refund form before marking payment received.')
      return { payment_status: 'received', payment_received_on: today }
    case 'reopen_review':
      if (d.review_status !== 'done') bad('Review is not done.')
      if (d.form_status === 'submitted') bad('Reopen the refund form first.')
      return { review_status: 'pending' }
    case 'reopen_form':
      if (d.form_status !== 'submitted') bad('Refund form is not submitted.')
      if (d.payment_status === 'received') bad('Reopen the payment first.')
      return { form_status: 'pending' }
    case 'reopen_payment':
      if (d.payment_status !== 'received') bad('Payment is not received.')
      return { payment_status: 'pending', payment_received_on: null }
  }
}

export type Chip = 'all' | 'needs_action' | 'review_pending' | 'form_pending' | 'payment_pending' | 'completed'
export const CHIPS: [Chip, string][] = [
  ['all', 'All'], ['needs_action', 'Needs action'], ['review_pending', 'Review pending'],
  ['form_pending', 'Form pending'], ['payment_pending', 'Payment pending'], ['completed', 'Completed'],
]

export function matchesChip(d: Deal, chip: Chip, today: string, alertDays: number): boolean {
  switch (chip) {
    case 'all': return true
    case 'needs_action': return evaluate(d, today, alertDays).isUrgent
    case 'review_pending': return d.review_status === 'pending'
    case 'form_pending': return d.form_status === 'pending'
    case 'payment_pending': return d.payment_status !== 'received'
    case 'completed': return isCompleted(d)
  }
}

const FAR = '9999-12-31'
const nextDeadline = (d: Deal) =>
  [d.review_status === 'pending' ? d.review_deadline : null, d.form_status === 'pending' ? d.refund_form_deadline : null]
    .filter(Boolean).sort()[0] ?? FAR

export type Sort = 'urgency' | 'newest' | 'amount'
export function sortDeals(list: Deal[], sort: Sort): Deal[] {
  const out = [...list]
  if (sort === 'urgency') out.sort((a, b) => nextDeadline(a).localeCompare(nextDeadline(b)) || b.date_taken.localeCompare(a.date_taken))
  if (sort === 'newest') out.sort((a, b) => b.date_taken.localeCompare(a.date_taken) || b.created_at.localeCompare(a.created_at))
  if (sort === 'amount') out.sort((a, b) => toPaise(b.amount_paid) - toPaise(a.amount_paid))
  return out
}
