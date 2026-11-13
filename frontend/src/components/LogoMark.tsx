import logoMark from '../assets/dealbook-logo-mark.svg'

type Props = { size?: number; className?: string; label?: string }

export function LogoMark({ size = 32, className = '', label }: Props) {
  return <img src={logoMark} alt={label ?? ''} aria-hidden={label ? undefined : true}
    width={size} height={size} decoding="async" className={`app-logo ${className}`} />
}
