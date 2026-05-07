// Pure markup for the Templates settings tab. Kept separate from
// config-panels so the HTML string is easy to test and the click-
// handler wiring stays local to the panel file.

export function escapeAttr(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderTemplateCardsHTML(templates) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return '<p style="color:var(--text-muted);font-size:var(--font-size-sm);padding:8px 0;">No templates yet. Save one from a pane, or import one from the clipboard.</p>';
  }

  return templates.map(t => {
    const name = escapeAttr(t.name);
    const cwd = escapeAttr(t.cwd || 'Default dir');
    const command = escapeAttr(t.command);
    const id = escapeAttr(t.id);
    return `
      <div class="profile-card" data-id="${id}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--text-primary)">${name}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${cwd} · ${command}
          </div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="fv-action-btn template-launch-btn" data-id="${id}" title="Launch a new pane from this template">Launch</button>
          <button class="fv-action-btn template-share-btn" data-id="${id}" title="Copy this template to the clipboard as shareable JSON">Share</button>
          <button class="fv-action-btn template-delete-btn" data-id="${id}" title="Delete this template">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}
