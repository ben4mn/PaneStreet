// Tests for session-profiles.js — CRUD operations

import { getProfiles, saveProfile, deleteProfile, resetProfiles } from '../session-profiles.js';

describe('session profiles', () => {
  beforeEach(() => resetProfiles());

  it('starts with empty profiles', () => {
    expect(getProfiles()).toEqual([]);
  });

  it('saves a profile', () => {
    saveProfile({ name: 'Dev', cwd: '/projects', startupCommand: 'npm run dev' });
    const profiles = getProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Dev');
    expect(profiles[0].cwd).toBe('/projects');
    expect(profiles[0].startupCommand).toBe('npm run dev');
  });

  it('assigns an id to new profiles', () => {
    saveProfile({ name: 'Test' });
    expect(getProfiles()[0].id).toBeTruthy();
  });

  it('updates profile with same name', () => {
    saveProfile({ name: 'Dev', cwd: '/old' });
    saveProfile({ name: 'Dev', cwd: '/new' });
    expect(getProfiles()).toHaveLength(1);
    expect(getProfiles()[0].cwd).toBe('/new');
  });

  it('persists to localStorage', () => {
    saveProfile({ name: 'Stored', cwd: '/tmp' });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'ps-profiles',
      expect.stringContaining('Stored')
    );
  });

  it('deletes a profile by name', () => {
    saveProfile({ name: 'Keep' });
    saveProfile({ name: 'Remove' });
    deleteProfile('Remove');
    const profiles = getProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Keep');
  });

  it('loads profiles from localStorage', () => {
    const data = [{ id: '1', name: 'Saved', cwd: '/home' }];
    localStorage.setItem('ps-profiles', JSON.stringify(data));
    resetProfiles(); // re-read from storage
    expect(getProfiles()).toHaveLength(1);
    expect(getProfiles()[0].name).toBe('Saved');
  });
});
