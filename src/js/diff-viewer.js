// Split diff viewer — side-by-side diff rendering

/**
 * Transform hunk data into aligned left/right line arrays.
 * Context lines appear on both sides. Deletions on left with placeholder on right.
 * Additions on right with placeholder on left.
 */
export function buildSplitDiffLines(hunks) {
  const left = [];
  const right = [];

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'context') {
        left.push({ kind: 'context', content: line.content, lineno: line.old_lineno });
        right.push({ kind: 'context', content: line.content, lineno: line.new_lineno });
      } else if (line.kind === 'deletion') {
        left.push({ kind: 'deletion', content: line.content, lineno: line.old_lineno });
        right.push({ kind: 'placeholder', content: '', lineno: null });
      } else if (line.kind === 'addition') {
        left.push({ kind: 'placeholder', content: '', lineno: null });
        right.push({ kind: 'addition', content: line.content, lineno: line.new_lineno });
      }
    }
  }

  return { left, right };
}

/**
 * Render a split diff view into a container element.
 */
export function renderSplitDiff(container, hunks, highlightFn) {
  const { left, right } = buildSplitDiffLines(hunks);
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'fv-split-diff';

  const leftPane = document.createElement('div');
  leftPane.className = 'fv-split-pane fv-split-old';

  const rightPane = document.createElement('div');
  rightPane.className = 'fv-split-pane fv-split-new';

  const gutter = document.createElement('div');
  gutter.className = 'fv-split-gutter';

  const renderLines = (lines, pane) => {
    const pre = document.createElement('pre');
    pre.className = 'fv-code';
    for (const line of lines) {
      const el = document.createElement('div');
      el.className = `fv-line fv-line-${line.kind}`;

      const num = document.createElement('span');
      num.className = 'fv-line-num';
      num.textContent = line.lineno != null ? String(line.lineno) : '';

      const content = document.createElement('span');
      content.className = 'fv-line-content';
      content.textContent = line.content;

      el.appendChild(num);
      el.appendChild(content);
      pre.appendChild(el);
    }
    pane.appendChild(pre);
  };

  renderLines(left, leftPane);
  renderLines(right, rightPane);

  wrapper.appendChild(leftPane);
  wrapper.appendChild(gutter);
  wrapper.appendChild(rightPane);
  container.appendChild(wrapper);

  // Synchronized scrolling
  let syncing = false;
  leftPane.addEventListener('scroll', () => {
    if (syncing) return;
    syncing = true;
    rightPane.scrollTop = leftPane.scrollTop;
    syncing = false;
  });
  rightPane.addEventListener('scroll', () => {
    if (syncing) return;
    syncing = true;
    leftPane.scrollTop = rightPane.scrollTop;
    syncing = false;
  });
}
