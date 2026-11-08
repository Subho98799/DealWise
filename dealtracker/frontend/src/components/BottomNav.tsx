import { NavLink, Link } from 'react-router-dom'
import type { ReactNode } from 'react'

const I = (d: string) => () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)
const HomeIcon = I('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z')
const DealsIcon = I('M4 6h16M4 12h16M4 18h10')
const PeopleIcon = I('M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9')
const GearIcon = I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')

function Tab({ to, label, icon, end, badge }: { to: string; label: string; icon: ReactNode; end?: boolean; badge?: number }) {
  return (
    <li className="flex-1">
      <NavLink to={to} end={end} data-testid={`nav-${label.toLowerCase()}`}
        className={({ isActive }) => `relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${isActive ? 'text-primary' : 'text-muted'}`}>
        {icon}
        {label}
        {!!badge && (
          <span data-testid="nav-deals-badge" className="absolute right-[22%] top-2 min-w-[18px] rounded-pill bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </NavLink>
    </li>
  )
}

export function BottomNav({ alertCount }: { alertCount: number }) {
  return (
    <nav data-testid="bottom-nav" aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-md">
      <ul className="mx-auto flex h-nav max-w-md items-stretch">
        <Tab to="/" label="Home" icon={<HomeIcon />} end />
        <Tab to="/deals" label="Deals" icon={<DealsIcon />} end badge={alertCount} />
        <li className="flex flex-1 items-center justify-center">
          <Link to="/deals/new" data-testid="nav-add-deal" aria-label="Add deal"
            className="-mt-6 grid h-14 w-14 place-items-center rounded-pill bg-primary text-primary-ink shadow-card transition-transform active:scale-95">
            <svg width="26" height="26" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          </Link>
        </li>
        <Tab to="/mediators" label="Mediators" icon={<PeopleIcon />} />
        <Tab to="/settings" label="Settings" icon={<GearIcon />} />
      </ul>
    </nav>
  )
}
