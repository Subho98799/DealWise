import { APP_DESCRIPTION, APP_NAME } from './app'

export const SITE_URL = 'https://dealbook.vfinite.com'
export const BRAND_NAME = 'Vfinite'
export const BRAND_URL = 'https://vfinite.com'
export const BRAND_LINE = `Built by ${BRAND_NAME}`

export const SITE_TITLE = `${APP_NAME} by ${BRAND_NAME} — Review Deal Management App`
export const SITE_DESCRIPTION = `${APP_NAME} by ${BRAND_NAME} is a review deal management app for India: track every review deal, refund form, mediator payment and deadline in one private place.`
export const SITE_KEYWORDS = [
  APP_NAME,
  `${APP_NAME} by ${BRAND_NAME}`,
  `${BRAND_NAME} ${APP_NAME}`,
  'review deal app',
  'review deal management app',
  'review deal management',
  'review deal tracker',
  'review deal manager',
  'review deals',
  'deals management app',
  'deal management app',
  'deal tracker app',
  'refund tracker app',
  'refund tracking app',
  'mediator payment tracker',
  'product review deal tracker',
  'review deal spreadsheet alternative',
].join(', ')

export const SOCIAL_IMAGE = {
  path: '/og-cover.png',
  width: 1200,
  height: 630,
  alt: `${APP_NAME} by ${BRAND_NAME}: every review deal, refund form and deadline in one place`,
}

export const SEO_IMAGE_URL = `${SITE_URL}${SOCIAL_IMAGE.path}`

export const FAQ: [string, string][] = [
  ['What is DealBook?', `${APP_NAME} is a review deal management app by ${BRAND_NAME}. It keeps every product review deal, refund form, mediator payment and deadline in one private list, so you can see at a glance what is still pending.`],
  ['What is a review deal?', 'A review deal is when you buy a product, review it as agreed, and a mediator releases the refund. DealBook tracks the whole chain: purchase, platform, mediator, deal type, refund form, commission, expected refund and every deadline.'],
  ['Is DealBook a website or a phone app?', `Both. ${APP_NAME} runs in any modern browser and installs to your home screen on Android and iPhone, with the same offline-first behaviour.`],
  ['Does DealBook work offline?', 'Yes. Deals are stored on your device, so you can add or edit one with no signal. Changes queue up and sync as soon as you reconnect.'],
  ['Can I import my existing spreadsheet?', 'Yes. Import Excel or CSV files, match your own column names, review every row with duplicates and errors called out, then undo the import if something looks wrong.'],
  ['Who can see my deals?', 'Only the account you sign in with. Every database query is scoped to you with row-level security, there are no advertising or analytics trackers, and you can delete your account and data at any time.'],
  ['What does it track for each deal?', 'Product, platform, mediator, deal type, amount paid, deductions, commission, expected refund, review and form deadlines, review, form and payment dates, notes and status.'],
]

export function siteJsonLd() {
  const organizationId = `${SITE_URL}/#organization`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: BRAND_NAME,
        url: BRAND_URL,
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/icons/icon-512.png`, width: 512, height: 512 },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: APP_NAME,
        alternateName: [`${APP_NAME} by ${BRAND_NAME}`, `${APP_NAME} app`],
        description: APP_DESCRIPTION,
        inLanguage: 'en-IN',
        publisher: { '@id': organizationId },
      },
      {
        '@type': ['WebApplication', 'SoftwareApplication'],
        '@id': `${SITE_URL}/#app`,
        name: `${APP_NAME} by ${BRAND_NAME}`,
        alternateName: APP_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Review deal management',
        operatingSystem: 'Web, Android, iOS',
        browserRequirements: 'Requires JavaScript and a modern browser.',
        inLanguage: 'en-IN',
        featureList: [
          'Review deal tracking from purchase to refund',
          'Refund form and payment deadlines with alerts',
          'Mediator-wise pending and received refunds',
          'Offline editing that syncs when you reconnect',
          'Excel and CSV import with row-by-row preview',
          'Installable on Android and iPhone',
        ],
        publisher: { '@id': organizationId },
        creator: { '@id': organizationId },
      },
    ],
  }
}

export function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  }
}
