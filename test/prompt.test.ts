import { describe, it, expect } from 'vitest'
import { renderPrompt } from '../src/prompt.js'

describe('renderPrompt', () => {
  it('substitutes $VAULT, $TODAY, and $OUTPUT_DIR', () => {
    const out = renderPrompt('vault=$VAULT day=$TODAY dir=$OUTPUT_DIR', {
      vault: '/v', today: '2026-06-03', outputDir: 'meetings', commit: true,
    })
    expect(out).toBe('vault=/v day=2026-06-03 dir=meetings')
  })

  it('replaces every occurrence of a variable', () => {
    const out = renderPrompt('$VAULT and $VAULT', { vault: '/v', today: 'x', outputDir: 'd', commit: true })
    expect(out).toBe('/v and /v')
  })

  it('leaves unknown $TOKENS untouched', () => {
    const out = renderPrompt('$UNKNOWN $VAULT', { vault: '/v', today: 'x', outputDir: 'd', commit: true })
    expect(out).toBe('$UNKNOWN /v')
  })

  it('substitutes $COMMIT as a string boolean', () => {
    expect(renderPrompt('commit=$COMMIT', { vault: 'v', today: 't', outputDir: 'd', commit: false })).toBe('commit=false')
  })
})
