import { ClipboardCheck, Info, RotateCcw, Sparkles, Sprout } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ConditionsForm } from '@/components/ConditionsForm'
import { ConditionTiles, PredictionList } from '@/components/Results'
import { confidenceLabel } from '@/lib/labels'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { FormField, Select } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/Page'
import { LoadingBlock } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { formatDateTime, formatPercent } from '@/lib/format'
import { EXAMPLE_CONDITIONS, pickConditions } from '@/lib/parameters'
import { useCrops, useFields, useRecommend } from '@/lib/queries'
import type { GrowingConditions, Recommendation } from '@/lib/types'

function RecommendationResult({ rec }: { rec: Recommendation }) {
  const crops = useCrops()
  const fields = useFields()
  const top = rec.predictions[0]
  if (!top) return null
  const crop = crops.data?.find((c) => c.slug === top.crop)
  const field = fields.data?.items.find((f) => f.id === rec.field_id)
  const confidence = confidenceLabel(top.probability)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-fg-subtle">Best match</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-3xl font-medium tracking-tight">{top.name}</h2>
          <Badge tone={confidence.tone}>
            {confidence.label} · {formatPercent(top.probability)}
          </Badge>
        </div>
        {crop && <p className="mt-2 text-sm text-fg-muted">{crop.description}</p>}
      </div>

      {rec.warnings.length > 0 && (
        <Alert tone="warning" title="Some conditions are unusual">
          <ul className="list-disc space-y-1 pl-4">
            {rec.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}
      {top.probability < 0.4 && rec.warnings.length === 0 && (
        <Alert tone="info" title="No clear winner">
          Several crops fit these conditions similarly well. Compare the options below with the crop
          advisor before deciding.
        </Alert>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold">Ranked crops</h3>
        <PredictionList predictions={rec.predictions} />
      </div>

      <div className="flex flex-wrap gap-2">
        <ButtonLink
          to={`/app/advisor?crop=${top.crop}&from=${rec.id}`}
          variant="secondary"
          icon={<ClipboardCheck />}
        >
          See what {top.name.toLowerCase()} needs
        </ButtonLink>
        {field && (
          <ButtonLink to={`/app/fields/${field.id}`} variant="secondary" icon={<Sprout />}>
            Plant on {field.name}
          </ButtonLink>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="mb-3 text-sm font-semibold">Conditions used</h3>
        <ConditionTiles conditions={rec.inputs} />
        <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
          <Info className="size-3.5" aria-hidden />
          {formatDateTime(rec.created_at)}
          {field ? ` · ${field.name}` : ''} · model {rec.model_version}
        </p>
      </div>
    </div>
  )
}

export default function RecommendPage() {
  const [params, setParams] = useSearchParams()
  const resultId = params.get('id')
  const fields = useFields()
  const recommend = useRecommend()
  // User edits win; otherwise the form mirrors the saved result being viewed.
  const [manualFieldId, setFieldId] = useState<string | null>(null)
  const [manualValues, setValues] = useState<GrowingConditions | null>(null)

  const saved = useQuery({
    queryKey: ['recommendations', 'one', resultId],
    queryFn: () => api.recommendation(resultId ?? ''),
    enabled: resultId !== null,
  })

  const selectableFields = fields.data?.items ?? []
  const fieldId = manualFieldId ?? saved.data?.field_id ?? ''
  const values = manualValues ?? saved.data?.inputs ?? null

  const onFieldChange = (id: string) => {
    setFieldId(id)
    const reading = selectableFields.find((f) => f.id === id)?.latest_reading
    if (reading) setValues(pickConditions(reading))
  }

  const submit = (conditions: GrowingConditions) =>
    recommend.mutate(
      { conditions, field_id: fieldId || null, top_k: 5 },
      { onSuccess: (rec) => setParams({ id: rec.id }) },
    )

  const selectedField = selectableFields.find((f) => f.id === fieldId)

  return (
    <>
      <PageHeader
        title="Crop recommendation"
        description="Enter soil and climate conditions, or load a field's latest reading, to rank the crops most likely to thrive."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card>
          <CardHeader
            title="Conditions"
            action={
              <Button size="sm" variant="ghost" onClick={() => setValues({ ...EXAMPLE_CONDITIONS })}>
                Use example
              </Button>
            }
          />
          <CardBody>
            <FormField
              label="Field"
              className="mb-6"
              hint={
                fieldId && !selectedField?.latest_reading
                  ? 'This field has no readings yet; enter values below.'
                  : 'Optional. Links the result to a field and fills in its latest reading.'
              }
            >
              {({ id, describedBy }) => (
                <Select id={id} value={fieldId} aria-describedby={describedBy} onChange={(e) => onFieldChange(e.target.value)}>
                  <option value="">No field</option>
                  {selectableFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.latest_reading ? '' : ' (no readings)'}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <ConditionsForm
              id="recommend-form"
              values={values}
              onSubmit={submit}
              footer={
                <>
                  {recommend.error && <Alert tone="danger">{recommend.error.message}</Alert>}
                  <Button type="submit" size="lg" className="w-full" icon={<Sparkles />} loading={recommend.isPending}>
                    Recommend crops
                  </Button>
                </>
              }
            />
          </CardBody>
        </Card>

        <Card className="lg:sticky lg:top-8">
          <CardBody>
            {resultId === null ? (
              <EmptyState
                icon={<Sparkles />}
                title="Your results will appear here"
                description="The model compares your conditions against 2,200 observations of 22 crops and ranks the best matches."
              />
            ) : saved.isPending ? (
              <LoadingBlock label="Loading result" />
            ) : saved.isError ? (
              <Alert tone="danger">{saved.error.message}</Alert>
            ) : (
              <>
                <div className="mb-4 flex justify-end">
                  <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => setParams({})}>
                    Clear result
                  </Button>
                </div>
                <RecommendationResult rec={saved.data} />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <p className="mt-6 text-xs text-fg-subtle">
        Recommendations come from a model trained on a public crop dataset that includes crops not
        commonly grown in Lesotho. Treat them as guidance and see the{' '}
        <Link to="/app/crops" className="underline">
          crop library
        </Link>{' '}
        for each crop's requirements.
      </p>
    </>
  )
}
