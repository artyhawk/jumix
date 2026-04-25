import { describe, expect, it } from 'vitest'
import {
  CHECKLIST_ITEMS,
  type ChecklistSubmission,
  REQUIRED_ITEMS_BY_CRANE_TYPE,
  findUncheckedRequiredItems,
} from '../src/api/checklist'

function makeSubmission(
  checked: Partial<Record<(typeof CHECKLIST_ITEMS)[number], boolean>>,
): ChecklistSubmission {
  const items = {} as ChecklistSubmission['items']
  for (const key of CHECKLIST_ITEMS) {
    items[key] = {
      checked: checked[key] ?? false,
      photoKey: null,
      notes: null,
    }
  }
  return { items }
}

describe('findUncheckedRequiredItems', () => {
  it('tower: harness required, missing → flagged', () => {
    const submission = makeSubmission({
      helmet: true,
      vest: true,
      boots: true,
      gloves: true,
      first_aid_kit: true,
      crane_integrity: true,
      // harness omitted
    })
    expect(findUncheckedRequiredItems('tower', submission)).toEqual(['harness'])
  })

  it('tower: all required checked → empty', () => {
    const submission = makeSubmission({
      helmet: true,
      vest: true,
      boots: true,
      gloves: true,
      harness: true,
      first_aid_kit: true,
      crane_integrity: true,
    })
    expect(findUncheckedRequiredItems('tower', submission)).toEqual([])
  })

  it('mobile: harness not required even if not checked', () => {
    const submission = makeSubmission({
      helmet: true,
      vest: true,
      boots: true,
      gloves: true,
      first_aid_kit: true,
      crane_integrity: true,
      // harness omitted - that's ok for mobile
    })
    expect(findUncheckedRequiredItems('mobile', submission)).toEqual([])
  })

  it('crawler: same as mobile', () => {
    const submission = makeSubmission({
      helmet: true,
      vest: true,
      boots: true,
      gloves: true,
      first_aid_kit: true,
      crane_integrity: true,
    })
    expect(findUncheckedRequiredItems('crawler', submission)).toEqual([])
  })

  it('multiple unchecked → all reported', () => {
    const submission = makeSubmission({
      helmet: true,
      // missing: vest, boots, gloves, first_aid_kit, crane_integrity
    })
    const missing = findUncheckedRequiredItems('mobile', submission)
    expect(missing).toContain('vest')
    expect(missing).toContain('boots')
    expect(missing).toContain('gloves')
    expect(missing).toContain('first_aid_kit')
    expect(missing).toContain('crane_integrity')
    expect(missing).not.toContain('helmet')
  })
})

describe('REQUIRED_ITEMS_BY_CRANE_TYPE', () => {
  it('tower includes harness, others do not', () => {
    expect(REQUIRED_ITEMS_BY_CRANE_TYPE.tower).toContain('harness')
    expect(REQUIRED_ITEMS_BY_CRANE_TYPE.mobile).not.toContain('harness')
    expect(REQUIRED_ITEMS_BY_CRANE_TYPE.crawler).not.toContain('harness')
    expect(REQUIRED_ITEMS_BY_CRANE_TYPE.overhead).not.toContain('harness')
  })
})
