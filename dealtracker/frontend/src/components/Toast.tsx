import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Toast = { id: number; message: string; action?: { label: string; run: () => void } }
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
        <div data-testid="toast" role="status" key={toast.id}
          className="rise fixed inset-x-3 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+12px)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-bg shadow-card">
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button data-testid="toast-action-button" className="min-h-[44px] px-2 font-extrabold text-accent"
              onClick={() => { toast.action!.run(); setToast(null) }}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  )
}
