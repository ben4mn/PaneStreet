// R/G TDD for the Claude-aware pane status refiner. Takes a base status
// from the Rust detector plus the last N terminal lines and returns a
// richer sub-status the UI can use to color borders and drive the mascot.

import { refineClaudeStatus, CLAUDE_SUB_STATUS } from '../claude-pane-status.js';

describe('refineClaudeStatus', () => {
  it('returns null sub-status when no Claude signals are present', () => {
    const result = refineClaudeStatus('Working', ['$ ls', 'file.txt', 'dir/']);
    expect(result.subStatus).toBe(null);
  });

  it('detects plan mode when plan approval prompt is visible', () => {
    const lines = [
      'Here is the plan:',
      '1. Read the files',
      '2. Make changes',
      '',
      'Would you like to proceed with this plan?',
    ];
    const result = refineClaudeStatus('WaitingForInput', lines);
    expect(result.subStatus).toBe(CLAUDE_SUB_STATUS.PLAN_MODE);
  });

  it('detects tool permission prompt', () => {
    const lines = [
      'I need to run this command:',
      '  rm -rf build/',
      '',
      'Do you want me to run this Bash command?',
      '  1. Yes',
      '  2. Yes, and don\'t ask again',
      '  3. No',
    ];
    const result = refineClaudeStatus('WaitingForInput', lines);
    expect(result.subStatus).toBe(CLAUDE_SUB_STATUS.PERMISSION_PROMPT);
  });

  it('detects stopped-but-alive when Claude exited but prompt is showing', () => {
    const lines = [
      'Total cost: $0.42',
      'Total tokens: 12345',
      '',
      '~/project $',
    ];
    const result = refineClaudeStatus('Idle', lines);
    expect(result.subStatus).toBe(CLAUDE_SUB_STATUS.STOPPED_ALIVE);
  });

  it('detects thinking state from the ellipsis spinner line', () => {
    const lines = [
      'User: refactor the file',
      '',
      '✽ Thinking…',
    ];
    const result = refineClaudeStatus('Working', lines);
    expect(result.subStatus).toBe(CLAUDE_SUB_STATUS.THINKING);
  });

  it('prefers permission prompt over plan mode when both appear', () => {
    const lines = [
      'Would you like to proceed with this plan?',
      'yes',
      'Running now.',
      'Do you want me to run this Bash command?',
    ];
    const result = refineClaudeStatus('WaitingForInput', lines);
    expect(result.subStatus).toBe(CLAUDE_SUB_STATUS.PERMISSION_PROMPT);
  });

  it('ignores Claude signals if the status is already Exited', () => {
    const lines = ['Would you like to proceed with this plan?'];
    const result = refineClaudeStatus('Exited', lines);
    expect(result.subStatus).toBe(null);
  });

  it('is defensive against empty or missing input', () => {
    expect(refineClaudeStatus('Working', []).subStatus).toBe(null);
    expect(refineClaudeStatus('Working', null).subStatus).toBe(null);
    expect(refineClaudeStatus('Working', undefined).subStatus).toBe(null);
  });

  it('exposes a claude-attached boolean for cross-pane features', () => {
    const withClaude = refineClaudeStatus('Working', ['✽ Thinking…']);
    expect(withClaude.claudeAttached).toBe(true);

    const noClaude = refineClaudeStatus('Working', ['$ npm test', 'PASS']);
    expect(noClaude.claudeAttached).toBe(false);
  });

  it('treats recent "total cost:" marker as evidence of Claude attachment', () => {
    const result = refineClaudeStatus('Idle', ['Total cost: $0.12', '~/project $']);
    expect(result.claudeAttached).toBe(true);
  });

  it('returns a stable object shape so callers can destructure safely', () => {
    const result = refineClaudeStatus('Working', ['anything']);
    expect(result).toHaveProperty('subStatus');
    expect(result).toHaveProperty('claudeAttached');
  });
});

describe('CLAUDE_SUB_STATUS enum', () => {
  it('exposes the expected set of states', () => {
    expect(CLAUDE_SUB_STATUS.PLAN_MODE).toBeTruthy();
    expect(CLAUDE_SUB_STATUS.PERMISSION_PROMPT).toBeTruthy();
    expect(CLAUDE_SUB_STATUS.STOPPED_ALIVE).toBeTruthy();
    expect(CLAUDE_SUB_STATUS.THINKING).toBeTruthy();
  });

  it('uses distinct values so downstream code can switch on them', () => {
    const values = Object.values(CLAUDE_SUB_STATUS);
    expect(new Set(values).size).toBe(values.length);
  });
});
