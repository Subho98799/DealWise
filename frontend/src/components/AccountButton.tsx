import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from './Avatar'

/** Opens Settings from the top bar, and closes it again when tapped there. */
export function AccountButton({ name, url }: { name: string | null; url: string | null }) {
  const location = useLocation()
  const navigate = useNavigate()
  const onSettings = location.pathname === '/settings'
  const toggle = () => {
    if (!onSettings) navigate('/settings')
    else if (location.key !== 'default') navigate(-1)
    else navigate('/')
  }
  return <button type="button" data-testid="account-avatar-button" className="account-avatar-link"
    aria-label={onSettings ? 'Close settings' : 'Account and settings'}
    aria-current={onSettings ? 'page' : undefined} onClick={toggle}>
    <Avatar name={name} url={url} size={38} />
  </button>
}
