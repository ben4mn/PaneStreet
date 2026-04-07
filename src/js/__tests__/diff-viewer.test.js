// Tests for split diff viewer — line alignment logic

import { buildSplitDiffLines } from '../diff-viewer.js';

describe('buildSplitDiffLines', () => {
  it('returns empty arrays for empty hunks', () => {
    const { left, right } = buildSplitDiffLines([]);
    expect(left).toEqual([]);
    expect(right).toEqual([]);
  });

  it('puts context lines on both sides', () => {
    const { left, right } = buildSplitDiffLines([{
      lines: [
        { kind: 'context', content: 'same line', old_lineno: 1, new_lineno: 1 },
      ],
    }]);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(left[0].content).toBe('same line');
    expect(right[0].content).toBe('same line');
    expect(left[0].kind).toBe('context');
    expect(right[0].kind).toBe('context');
  });

  it('puts deletions on left with placeholder on right', () => {
    const { left, right } = buildSplitDiffLines([{
      lines: [
        { kind: 'deletion', content: 'removed', old_lineno: 1, new_lineno: null },
      ],
    }]);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(left[0].kind).toBe('deletion');
    expect(left[0].content).toBe('removed');
    expect(right[0].kind).toBe('placeholder');
  });

  it('puts additions on right with placeholder on left', () => {
    const { left, right } = buildSplitDiffLines([{
      lines: [
        { kind: 'addition', content: 'added', old_lineno: null, new_lineno: 1 },
      ],
    }]);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(right[0].kind).toBe('addition');
    expect(right[0].content).toBe('added');
    expect(left[0].kind).toBe('placeholder');
  });

  it('maintains alignment with mixed changes', () => {
    const { left, right } = buildSplitDiffLines([{
      lines: [
        { kind: 'context', content: 'a', old_lineno: 1, new_lineno: 1 },
        { kind: 'deletion', content: 'b', old_lineno: 2, new_lineno: null },
        { kind: 'addition', content: 'c', old_lineno: null, new_lineno: 2 },
        { kind: 'context', content: 'd', old_lineno: 3, new_lineno: 3 },
      ],
    }]);
    expect(left).toHaveLength(4);
    expect(right).toHaveLength(4);
    // Row 0: context on both
    expect(left[0].kind).toBe('context');
    expect(right[0].kind).toBe('context');
    // Row 1: deletion left, placeholder right
    expect(left[1].kind).toBe('deletion');
    expect(right[1].kind).toBe('placeholder');
    // Row 2: placeholder left, addition right
    expect(left[2].kind).toBe('placeholder');
    expect(right[2].kind).toBe('addition');
    // Row 3: context both
    expect(left[3].kind).toBe('context');
    expect(right[3].kind).toBe('context');
  });
});
