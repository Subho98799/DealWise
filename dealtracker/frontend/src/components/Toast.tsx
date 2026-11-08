import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Toast as ToastMessage } from './ui'

type Toast = { id: number; message: string; action?: { label: string; run: () => void }; secondaryAction?: { label: string; run: () => void }; link?: { label: string; to: string } }
const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const show = useCallback((t: Omit<Toast, 'id'>) => {
    clearTimeout(timer.current)
    setToast({ ...t, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), 5000)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div data-testid="toast" key={toast.id} className="rise">
          <ToastMessage>{toast.message}
          {toast.action && (
            <button data-testid="toast-action-button" className="min-h-[44px] px-2 font-extrabold text-accent"
              onClick={() => { toast.action!.run(); setToast(null) }}>
              {toast.action.label}
            </button>
          )}
          {toast.secondaryAction && (
            <button data-testid="toast-secondary-action-button" className="toast-secondary-action"
              onClick={() => { toast.secondaryAction!.run(); setToast(null) }}>
              {toast.secondaryAction.label}
            </button>
          )}
          {toast.link && (
            <Link data-testid="toast-link" to={toast.link.to} onClick={() => setToast(null)}
              className="flex min-h-[44px] items-center px-2 font-extrabold text-accent">
              {toast.link.label}
            </Link>
          )}
          </ToastMessage>
        </div>
      )}
    </Ctx.Provider>
  )
}
