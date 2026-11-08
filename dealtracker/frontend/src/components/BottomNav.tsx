import { Link, NavLink, useLocation } from 'react-router-dom'
import { House, ListChecks, Plus, Settings2, UsersRound, type LucideIcon } from 'lucide-react'

function Tab({ to, label, icon: Icon, end, badge }: { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: number }) {
  return <li className="flex-1">
    <NavLink to={to} end={end} data-testid={`nav-${label.toLowerCase()}`} className={({ isActive }) => `nav-tab ${isActive ? 'is-active' : ''}`}>
      {({ isActive }) => <>
        <Icon size={21} strokeWidth={isActive ? 2.5 : 1.9} fill={isActive ? 'currentColor' : 'none'} aria-hidden="true" />
        <span>{label}</span>
        {!!badge && <span data-testid="nav-deals-badge" className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
      </>}
    </NavLink>
  </li>
}

export function BottomNav({ alertCount }: { alertCount: number }) {
  const location = useLocation()
  return <nav data-testid="bottom-nav" aria-label="Main" className="app-bottom-nav safe-bottom">
    <ul className="app-bottom-nav-inner">
      <Tab to="/" label="Home" icon={House} end />
      <Tab to="/deals" label="Deals" icon={ListChecks} end badge={alertCount} />
      <li className="flex flex-1 items-center justify-center">
        <Link to="/deals/new" state={{ backgroundLocation: location }} data-testid="nav-add-deal" aria-label="Add deal" className="nav-add-button">
          <Plus size={26} strokeWidth={2.5} aria-hidden="true" />
        </Link>
      </li>
      <Tab to="/mediators" label="Mediators" icon={UsersRound} />
      <Tab to="/settings" label="Settings" icon={Settings2} />
    </ul>
  </nav>
}
