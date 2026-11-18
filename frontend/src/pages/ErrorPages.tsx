import { Compass, TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

function Frame({ inline, children }: { inline?: boolean; children: React.ReactNode }) {
  return inline ? (
    <div className="py-10">{children}</div>
  ) : (
    <div className="grid min-h-dvh place-items-center px-4">{children}</div>
  )
}

export function NotFoundPage({ inline = false }: { inline?: boolean }) {
  useDocumentTitle('Page not found')
  return (
    <Frame inline={inline}>
      <EmptyState
        icon={<Compass />}
        title="Page not found"
        description="The page you are looking for doesn't exist or has moved."
        action={<ButtonLink to={inline ? '/app' : '/'}>Go back home</ButtonLink>}
      />
    </Frame>
  )
}

export function ErrorPage({ inline = false }: { inline?: boolean }) {
  const error = useRouteError()
  useDocumentTitle('Something went wrong')
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage inline={inline} />
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
  return (
    <Frame inline={inline}>
      <EmptyState
        icon={<TriangleAlert />}
        title="Something went wrong"
        description={message}
        action={
          <ButtonLink to={inline ? '/app' : '/'} reloadDocument>
            Reload
          </ButtonLink>
        }
      />
    </Frame>
  )
}
