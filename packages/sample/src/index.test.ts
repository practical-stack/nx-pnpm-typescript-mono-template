import { describe, expect, it } from 'vitest'
import { greet } from './index.js'

describe('greet', () => {
  it('returns hello greeting', () => {
    expect(greet('world')).toBe('hello, world')
  })
})
