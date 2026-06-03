import { describe, it, expect } from 'vitest'
import { renderPrompt } from '../src/prompt.js'

describe('renderPrompt', () => {
  it('substitutes $VAULT, $TODAY, and $OUTPUT_DIR', () => {
    const out = renderPrompt('vault=$VAULT day=$TODAY dir=$OUTPUT_DIR', {
      vault: '/v', today: '2026-06-03', outputDir: 'meetings',
    })
    expect(out).toBe('vault=/v day=2026-06-03 dir=meetings')
  })

  it('replaces every occurrence of a variable', () => {
    const out = renderPrompt('$VAULT and $VAULT', { vault: '/v', today: 'x', outputDir: 'd' })
    expect(out).toBe('/v and /v')
  })

  it('leaves unknown $TOKENS untouched', () => {
    const out = renderPrompt('$UNKNOWN $VAULT', { vault: '/v', today: 'x', outputDir: 'd' })
    expect(out).toBe('$UNKNOWN /v')
  })
})
