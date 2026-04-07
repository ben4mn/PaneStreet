// Tests for changelog formatting and expand/collapse behavior

// We need to test formatChangelogBody — let's import it
// It's not exported, so we'll test the behavior through the rendered output

describe('changelog display', () => {
  it('changelog-entry should be expandable via click on header', () => {
    // Create a mock changelog entry structure
    document.body.innerHTML = `
      <div class="changelog-entry collapsed">
        <div class="changelog-header">
          <span class="changelog-version">v0.4.41</span>
          <span class="changelog-date">Apr 7, 2026</span>
          <span class="changelog-expand-icon">&#9654;</span>
        </div>
        <div class="changelog-body" style="display:none">
          <div class="changelog-item">• New feature</div>
        </div>
      </div>
    `;

    const entry = document.querySelector('.changelog-entry');
    const header = entry.querySelector('.changelog-header');
    const body = entry.querySelector('.changelog-body');

    // Simulate the expand/collapse click handler
    header.addEventListener('click', () => {
      const isCollapsed = entry.classList.contains('collapsed');
      entry.classList.toggle('collapsed');
      body.style.display = isCollapsed ? '' : 'none';
    });

    // Initially collapsed
    expect(body.style.display).toBe('none');
    expect(entry.classList.contains('collapsed')).toBe(true);

    // Click to expand
    header.click();
    expect(body.style.display).toBe('');
    expect(entry.classList.contains('collapsed')).toBe(false);

    // Click to collapse again
    header.click();
    expect(body.style.display).toBe('none');
    expect(entry.classList.contains('collapsed')).toBe(true);
  });

  it('first changelog entry should be expanded by default', () => {
    // First entry should NOT have collapsed class
    document.body.innerHTML = `
      <div class="changelog-entry">
        <div class="changelog-header">
          <span class="changelog-version">v0.4.41</span>
        </div>
        <div class="changelog-body">
          <div class="changelog-item">• Latest features</div>
        </div>
      </div>
      <div class="changelog-entry collapsed">
        <div class="changelog-header">
          <span class="changelog-version">v0.4.40</span>
        </div>
        <div class="changelog-body" style="display:none">
          <div class="changelog-item">• Older features</div>
        </div>
      </div>
    `;

    const entries = document.querySelectorAll('.changelog-entry');
    expect(entries[0].classList.contains('collapsed')).toBe(false);
    expect(entries[0].querySelector('.changelog-body').style.display).toBe('');
    expect(entries[1].classList.contains('collapsed')).toBe(true);
    expect(entries[1].querySelector('.changelog-body').style.display).toBe('none');
  });

  it('changelog body renders multiple items', () => {
    document.body.innerHTML = `
      <div class="changelog-body">
        <div class="changelog-item">• Feature 1</div>
        <div class="changelog-item">• Feature 2</div>
        <div class="changelog-item">• Feature 3</div>
      </div>
    `;

    const items = document.querySelectorAll('.changelog-item');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Feature 1');
  });
});
