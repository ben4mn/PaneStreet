// Tests for layout-snapshots.js — save/load/delete

import { getSnapshots, saveSnapshot, deleteSnapshot, resetSnapshots } from '../layout-snapshots.js';

describe('layout snapshots', () => {
  beforeEach(() => resetSnapshots());

  it('starts empty', () => {
    expect(getSnapshots()).toEqual([]);
  });

  it('saves a snapshot', () => {
    saveSnapshot('Two-up', { layoutMode: 'auto', sessions: [{ cwd: '/a' }, { cwd: '/b' }] });
    const snaps = getSnapshots();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].name).toBe('Two-up');
    expect(snaps[0].state.sessions).toHaveLength(2);
  });

  it('assigns id and timestamp', () => {
    saveSnapshot('Test', { layoutMode: 'auto' });
    const snap = getSnapshots()[0];
    expect(snap.id).toBeTruthy();
    expect(snap.createdAt).toBeTruthy();
  });

  it('prevents duplicate names by overwriting', () => {
    saveSnapshot('Same', { layoutMode: 'auto' });
    saveSnapshot('Same', { layoutMode: 'freeform' });
    expect(getSnapshots()).toHaveLength(1);
    expect(getSnapshots()[0].state.layoutMode).toBe('freeform');
  });

  it('deletes by name', () => {
    saveSnapshot('Keep', { layoutMode: 'auto' });
    saveSnapshot('Remove', { layoutMode: 'auto' });
    deleteSnapshot('Remove');
    expect(getSnapshots()).toHaveLength(1);
    expect(getSnapshots()[0].name).toBe('Keep');
  });

  it('persists to localStorage', () => {
    saveSnapshot('Persist', { layoutMode: 'auto' });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'ps-layout-snapshots',
      expect.stringContaining('Persist')
    );
  });
});
