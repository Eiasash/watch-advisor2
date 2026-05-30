import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// Regression guard for the Header layout. The sibling vanilla apps (FM/IM/Geri) all
// shipped a header-overlap bug from position:absolute toolbar icons; Geri shipped it 3x.
// watch-advisor2's Header is React and already correct (flex, space-between) — this
// guard fails if it ever regresses to absolute positioning of the action cluster.
const src = readFileSync('src/components/Header.jsx', 'utf8');

describe('Header layout — flex, no absolute-positioned overlap', () => {
  it('the header container is a flex row with space-between', () => {
    expect(src).toMatch(/display:\s*["']flex["']/);
    expect(src).toMatch(/justifyContent:\s*["']space-between["']/);
  });

  it('the action cluster (.wa-header-actions) is a flex row', () => {
    expect(src).toContain('wa-header-actions');
    // the actions wrapper sets display:flex
    const actions = src.slice(src.indexOf('wa-header-actions'));
    expect(actions).toMatch(/display:\s*["']flex["']/);
  });

  it('the header does NOT use absolute positioning (the overlap mechanism)', () => {
    expect(src).not.toMatch(/position:\s*["']absolute["']/);
  });

  it('header wraps gracefully on narrow widths (flexWrap)', () => {
    expect(src).toMatch(/flexWrap:\s*["']wrap["']/);
  });

  it('the action buttons (search / theme toggle / settings) are present', () => {
    expect(src).toContain('onOpenSearch');
    expect(src).toContain('onOpenSettings');
    expect(src).toMatch(/onClick=\{toggle\}/);
  });
});
