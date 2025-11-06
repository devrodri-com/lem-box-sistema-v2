import { describe, it, expect, vi } from 'vitest'

// Mock de firebase/auth
vi.mock('firebase/auth', () => {
  return {
    getAuth: () => ({ currentUser: { uid: 'test-uid' } }),
  }
})

import { getCurrentUid } from '../../services/userService'

describe('userService (integration)', () => {
  it('obtiene el uid actual desde Firebase Auth', () => {
    expect(getCurrentUid()).toBe('test-uid')
  })
})