import { LESOTHO_STATUS } from '@/lib/labels'
import type { Crop, LesothoStatus } from '@/lib/types'

const ORDER: LesothoStatus[] = ['staple', 'common', 'possible', 'unsuitable']

/** <option>s for a crop picker, grouped so the crops Lesotho grows most come first. */
export function CropOptions({ crops }: { crops: Crop[] | undefined }) {
  return (
    <>
      {ORDER.map((status) => {
        const group = (crops ?? []).filter((c) => c.lesotho === status)
        if (group.length === 0) return null
        return (
          <optgroup key={status} label={LESOTHO_STATUS[status].heading}>
            {group.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </>
  )
}
