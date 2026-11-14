# DealWise design system

The visual system is mobile-first for a 390px screen. The app should feel calm and clear, with the money and next action easy to spot. `frontend/src/styles/tokens.css` is the single source for palette, type, spacing, radii, and shadow values. Components consume tokens; screens do not introduce new colors.

## Palette

| Token | Use |
|---|---|
| `--color-bg` | Warm page canvas |
| `--color-surface` / `--color-surface-2` | Cards, inputs, and quiet controls |
| `--color-ink` / `--color-muted` | Primary and supporting text |
| `--color-border` | Dividers and control outlines |
| `--color-brand` / `--color-brand-ink` / `--color-brand-soft` | Primary action, its label, and subtle emphasis |
| `--color-success` / `--color-success-soft` | Received money and completed work |
| `--color-warning` / `--color-warning-soft` | Approaching deadlines |
| `--color-danger` / `--color-danger-soft` | Overdue work and destructive actions |

The selectable color themes are **Indigo** (the violet default), **Sky**, **Forest**, and **Saffron**. Light and dark values live side by side in `tokens.css`; the root `data-theme` attribute selects the palette and `data-mode` selects Light or Dark. When `data-mode` is absent, the selected theme follows the operating-system preference. Settings stores both choices on this device. A same-origin `frontend/public/theme-init.js` applies saved values before the app renders and is included in the offline app shell. The theme-color meta tag follows the active palette and mode.

Status tokens are shared across all palettes. The light success and warning text tokens and the Forest/Saffron light brand-soft backgrounds are slightly adjusted from their requested starting values to meet WCAG AA for chip text. Saffron hero amounts use a bright saffron accent so they remain legible on the dark ink gradient. Avatar tones and overlays also come from tokens. `yarn lint` checks that source files do not add raw hex colors outside `tokens.css`.

To add a theme, define its light and dark palette tokens in `frontend/src/styles/tokens.css`, including matching selectors for explicit mode and system-dark mode. Add the theme key to the validation list in `frontend/src/lib/appearance.ts` and `frontend/public/theme-init.js`, then add its Settings option. Keep all literal colors in `tokens.css`, verify text and chip contrast for both modes, and add persistence/invalid-value coverage if the stored values change.

## Type and layout

- Inter is the UI face; Plus Jakarta Sans 600/700 is for display headings and prominent values. Both are bundled with the app.
- The type scale is 12, 14, 16, 20, 24, 32, and 40px. Money uses tabular lining numerals.
- Spacing follows a 4px grid. Controls use 12px corners, cards use 20px corners, and chips are fully rounded.
- Light cards use a restrained shadow. Dark cards rely on borders.
- The content column is at most 480px on desktop; page gutters and bottom navigation respect device safe areas.

## Public landing and legal pages

The logged-out `/login` route is the product landing page. Authenticated users are redirected straight to Home and never see it. It uses the same tokens and UI primitives, one `h1`, labelled sections, and visible focus states. The page stays short on purpose: a hero with the Google-branded sign-in button and install link, the Home preview, a four-card feature grid, one privacy band, a short "review deal management" explainer, and a compact FAQ built from `<details>` rows, followed by the footer. Every section heading carries the product language people search for (`review deal app`, `deals management app`, `refund forms`, `mediator payments`) without keyword stuffing, and the footer carries the small `Built by Vfinite` credit that links to the brand site. The sign-in button uses an 18px Google mark, the "Continue with Google" wording, and Google logo colours defined only in `tokens.css`. The Home preview is CSS and inline SVG with clearly labelled sample deals; its float, card and progress animations stop under `prefers-reduced-motion`.

`/privacy` and `/terms` are public plain-English pages linked from the landing footer. Both are marked with a top-of-file legal-review comment and should be reviewed before public launch. The support address comes from `CONTACT_EMAIL` in `src/config/app.ts` and is still a placeholder.

SEO tags (title, description, Open Graph, Twitter, canonical and theme colour) live in `index.html`; `src/lib/pageMeta.ts` keeps the absolute canonical and social URLs correct per page at runtime.

## Components and interaction

Use the small primitives in `src/components/ui.tsx`: Button, IconButton, Card, Chip, Stat, Sheet, Toast, Skeleton, EmptyState, and SegmentedControl. Use native labeled `<input>` and `<select>` elements with the shared `ui-input` class where appropriate. Use `Avatar` for people and mediators. Keep existing `data-testid` hooks when restyling.

- Interactive targets are at least 44px tall and have visible keyboard focus.
- Inputs always have a visible label. Errors use text and an icon or shape alongside color.
- Toasts announce politely and keep Undo visible long enough to use.
- Sheets close on Escape and on backdrop click, and prevent background scrolling while open.
- Motion is brief and removed when `prefers-reduced-motion` is enabled.
- No runtime font, image, or icon CDN. Use bundled fonts, Lucide icons, and inline SVG.
- Keep offline data, sync, API calls, and business rules in their current layers.
- Keep horizontally scrolling rows intentional and self-contained; page content must fit without horizontal overflow at 360px and 390px.
- The shared `usePwaInstall` flow serves Home, Settings, and Login. It uses the native prompt when available, provides iPhone Share and browser-menu steps otherwise, and offers a copy-link action in in-app browsers. Only standalone display mode, `navigator.standalone`, and `appinstalled` determine installed state; dismissal lasts 14 days.
- The install manifest includes narrow Home screenshots from `docs/screenshots` in the public app shell. Real installation can only be verified on a deployed HTTPS URL on a real phone.
- Generate PWA icons from the palette with `yarn icons`; do not edit generated PNGs by hand.
- Deal detail timelines expose only the next action allowed by the shared transition rules. Later incomplete steps stay locked with a reason.
- Deal cards use three progress segments and show net/deadline chips only when they add useful information. Deadline chips follow the user's alert window.
- Money entry shows Amount paid and Less on the first row, optional Commission on the second, and a live `Paid - Less + Commission = Net refund` breakdown. Cards show the numbered deal and net refund, with Paid, nonzero Less/Commission chips, and gain/loss; detail repeats the breakdown.
- Deal numbers are stable within the complete local list, including filtered views and mediator lists. Deal search accepts `12` or `#12`; numbers can shift after deletion or a date change.
- Under reduced motion, headline values render their final amount without starting a count-up. Negative net-return heroes use the muted danger surface.
- Keep scrollable content clear of the bottom dock with `--nav-height + safe-area inset + 24px` of bottom space.

## Screenshot review

The 390 × 844 light and dark screen captures are in [`docs/screenshots`](screenshots/). They use a local Playwright capture script with a demo account and fixture data; the script mocks API responses, waits for the hero animation to finish, and does not add an authentication path to the app. The landing captures use a second context with a mocked `401` from `/api/me`, so no test-login route exists. The seed and capture helper is at `frontend/dev-only/capture-design-screenshots.mjs` and refuses to run with `ENV=prod` or `NODE_ENV=production`.

| Screen | Light | Dark |
|---|---|---|
| Landing | [light](screenshots/light-landing.png) | [dark](screenshots/dark-landing.png) |
| Home | [light](screenshots/light-home.png) | [dark](screenshots/dark-home.png) |
| Deals | [light](screenshots/light-deals.png) | [dark](screenshots/dark-deals.png) |
| Quick add | [light](screenshots/light-quick-add.png) | [dark](screenshots/dark-quick-add.png) |
| Deal detail | [light](screenshots/light-deal-detail.png) | [dark](screenshots/dark-deal-detail.png) |
| Mediators | [light](screenshots/light-mediators.png) | [dark](screenshots/dark-mediators.png) |
| Settings | [light](screenshots/light-settings.png) | [dark](screenshots/dark-settings.png) |

To regenerate them, start the Vite development server and run `node dev-only/capture-design-screenshots.mjs` from `frontend/`. The capture also checks 360px, 768px, and 1280px layouts and confirms the wide-screen app column stays centered at 480px. The landing page is checked at 360px and 1280px too.
