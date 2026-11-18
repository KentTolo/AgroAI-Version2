import { useEffect } from 'react'

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · AgroAI` : 'AgroAI · Smart crop recommendations'
  }, [title])
}
