import { FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { ConfirmDialog } from './ui/Dialog'

/** Shown in the browser-only demo build so visitors know where their data lives. */
export function DemoBanner() {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)

  const reset = async () => {
    const { resetDemoData } = await import('@/demo/server')
    resetDemoData()
    logout()
    window.location.assign(import.meta.env.BASE_URL)
  }

  return (
    <div className="bg-ink text-ink-fg">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-xs sm:px-6">
        <span className="inline-flex items-center gap-1.5 font-semibold text-highlight">
          <FlaskConical className="size-3.5" aria-hidden /> Live demo
        </span>
        <span className="text-ink-fg/75">Everything runs and is saved in this browser only.</span>
        <button type="button" onClick={() => setOpen(true)} className="font-semibold underline underline-offset-2 hover:text-highlight">
          Reset demo data
        </button>
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void reset()}
        title="Reset the demo?"
        description="This deletes every account, field and reading saved in this browser and restores the original demo farm."
        confirmLabel="Reset demo"
      />
    </div>
  )
}
