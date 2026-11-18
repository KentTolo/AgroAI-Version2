import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ConditionsForm } from '@/components/ConditionsForm'
import { AdvisoryResult } from '@/components/Results'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { FormField, Select } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/Page'
import { api } from '@/lib/api'
import { EXAMPLE_CONDITIONS, pickConditions } from '@/lib/parameters'
import { useAdvise, useCrops, useFields } from '@/lib/queries'
import type { GrowingConditions } from '@/lib/types'

export default function AdvisorPage() {
  const [params] = useSearchParams()
  const crops = useCrops()
  const fields = useFields()
  const advise = useAdvise()
  const [crop, setCrop] = useState(params.get('crop') ?? '')
  const [cropError, setCropError] = useState<string | null>(null)
  const [manualValues, setValues] = useState<GrowingConditions | null>(null)

  // Arriving from a recommendation: reuse its conditions and run the assessment straight away.
  const fromId = params.get('from')
  const source = useQuery({
    queryKey: ['recommendations', 'one', fromId],
    queryFn: () => api.recommendation(fromId ?? ''),
    enabled: fromId !== null,
  })
  const values = manualValues ?? source.data?.inputs ?? null
  const { mutate } = advise
  const initialCrop = params.get('crop')
  useEffect(() => {
    if (source.data && initialCrop) mutate({ crop: initialCrop, conditions: source.data.inputs })
  }, [source.data, initialCrop, mutate])

  const submit = (conditions: GrowingConditions) => {
    if (!crop) {
      setCropError('Choose a crop to assess')
      return
    }
    setCropError(null)
    advise.mutate({ crop, conditions })
  }

  const fieldsWithReadings = (fields.data?.items ?? []).filter((f) => f.latest_reading)

  return (
    <>
      <PageHeader
        title="Crop advisor"
        description="Already have a crop in mind? Check each condition against what that crop needs and get practical steps to close the gaps."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card>
          <CardHeader
            title="Crop and conditions"
            action={
              <Button size="sm" variant="ghost" onClick={() => setValues({ ...EXAMPLE_CONDITIONS })}>
                Use example
              </Button>
            }
          />
          <CardBody>
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <FormField label="Crop" error={cropError ?? undefined}>
                {({ id, invalid }) => (
                  <Select id={id} invalid={invalid} value={crop} onChange={(e) => setCrop(e.target.value)}>
                    <option value="">Choose a crop…</option>
                    {crops.data?.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField label="Load from field">
                {({ id }) => (
                  <Select
                    id={id}
                    defaultValue=""
                    disabled={fieldsWithReadings.length === 0}
                    onChange={(e) => {
                      const reading = fieldsWithReadings.find((f) => f.id === e.target.value)?.latest_reading
                      if (reading) setValues(pickConditions(reading))
                    }}
                  >
                    <option value="">{fieldsWithReadings.length ? 'Latest reading from…' : 'No field readings'}</option>
                    {fieldsWithReadings.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
            </div>
            <ConditionsForm
              id="advisor-form"
              values={values}
              onSubmit={submit}
              footer={
                <>
                  {advise.error && <Alert tone="danger">{advise.error.message}</Alert>}
                  <Button type="submit" size="lg" className="w-full" icon={<ClipboardCheck />} loading={advise.isPending}>
                    Assess suitability
                  </Button>
                </>
              }
            />
          </CardBody>
        </Card>

        <Card className="lg:sticky lg:top-8">
          <CardBody>
            {advise.data ? (
              <AdvisoryResult advisory={advise.data} />
            ) : (
              <EmptyState
                icon={<ClipboardCheck />}
                title="Pick a crop and enter conditions"
                description="You'll get a suitability score, each factor compared with the crop's optimal range, and advice for anything that falls short."
              />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  )
}
