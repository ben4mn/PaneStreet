// R/G TDD for narrator tone — three pools drive the same selection
// logic, tone is chosen by the caller (from localStorage upstream).

import { pickNarratorQuip, NARRATOR_TONES } from '../companion-narrator.js';

describe('NARRATOR_TONES enum', () => {
  it('exposes the three tones', () => {
    expect(NARRATOR_TONES.ENTHUSIASTIC).toBeTruthy();
    expect(NARRATOR_TONES.NEUTRAL).toBeTruthy();
    expect(NARRATOR_TONES.TERSE).toBeTruthy();
  });

  it('uses distinct values so callers can switch on them', () => {
    const values = Object.values(NARRATOR_TONES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('pickNarratorQuip with tone', () => {
  it('defaults to neutral when tone is omitted', () => {
    const quip = pickNarratorQuip({ severity: 'status', workingCount: 2, finishedCount: 0 });
    expect(quip).toBeTruthy();
    expect(typeof quip).toBe('string');
  });

  it('returns a string for every tone on every non-null severity', () => {
    const severities = [
      { severity: 'urgent', paneName: 'b' },
      { severity: 'attention', paneName: 'c' },
      { severity: 'status', workingCount: 2, finishedCount: 1 },
      { severity: 'idle' },
    ];
    for (const tone of Object.values(NARRATOR_TONES)) {
      for (const n of severities) {
        const quip = pickNarratorQuip(n, { tone });
        expect(typeof quip).toBe('string');
        expect(quip.length).toBeGreaterThan(0);
      }
    }
  });

  it('enthusiastic tone produces a different corpus than terse', () => {
    // Run each tone 30 times; the distinct quip sets must differ.
    const enth = new Set();
    const terse = new Set();
    for (let i = 0; i < 30; i++) {
      enth.add(pickNarratorQuip({ severity: 'status', workingCount: 3, finishedCount: 0 }, { tone: NARRATOR_TONES.ENTHUSIASTIC }));
      terse.add(pickNarratorQuip({ severity: 'status', workingCount: 3, finishedCount: 0 }, { tone: NARRATOR_TONES.TERSE }));
    }
    // At least one quip must appear in enthusiastic that doesn't appear in terse.
    const onlyInEnth = [...enth].filter(q => !terse.has(q));
    expect(onlyInEnth.length).toBeGreaterThan(0);
  });

  it('terse tone never returns a quip over 30 characters', () => {
    for (let i = 0; i < 40; i++) {
      const quip = pickNarratorQuip({ severity: 'status', workingCount: 2, finishedCount: 0 }, { tone: NARRATOR_TONES.TERSE });
      expect(quip.length).toBeLessThanOrEqual(30);
    }
  });

  it('falls back to neutral if given an unknown tone', () => {
    const quip = pickNarratorQuip({ severity: 'idle' }, { tone: 'mystery-tone' });
    expect(typeof quip).toBe('string');
  });

  it('still handles urgent with pane name in every tone', () => {
    for (const tone of Object.values(NARRATOR_TONES)) {
      const quip = pickNarratorQuip({ severity: 'urgent', paneName: 'my-repo' }, { tone });
      expect(quip).toMatch(/my-repo/);
    }
  });
});
