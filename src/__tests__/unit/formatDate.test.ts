import { describe, it, expect } from 'vitest'
import { formatDate } from '../../utils/formatDate'

describe('formatDate', () => {
  it('devuelve YYYY-MM-DD', () => {
    const d = new Date('2025-01-02T10:00:00Z')
    expect(formatDate(d)).toBe('2025-01-02')
  })
})