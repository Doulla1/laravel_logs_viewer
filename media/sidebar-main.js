const vscode = acquireVsCodeApi();

const elements = {
  openViewerButton: document.getElementById('openViewerButton'),
  refreshButton: document.getElementById('refreshButton'),
  searchInput: document.getElementById('searchInput'),
  summary: document.getElementById('summary'),
  errorBanner: document.getElementById('errorBanner'),
  emptyState: document.getElementById('emptyState'),
  list: document.getElementById('list')
};

let searchTimer = undefined;
let currentQuery = '';

function init() {
  elements.openViewerButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'openViewer' });
  });

  elements.refreshButton.addEventListener('click', () => {
    if (elements.refreshButton.disabled) {
      return;
    }

    vscode.postMessage({ type: 'refresh' });
  });

  elements.searchInput.addEventListener('input', (event) => {
    const target = event.target;
    const nextQuery = target instanceof HTMLInputElement ? target.value : '';

    if (searchTimer !== undefined) {
      clearTimeout(searchTimer);
    }

    searchTimer = setTimeout(() => {
      vscode.postMessage({
        type: 'search',
        payload: {
          query: nextQuery
        }
      });
    }, 120);
  });

  elements.list.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const row = target.closest('.log-item');
    if (!(row instanceof HTMLButtonElement)) {
      return;
    }

    const entryId = row.dataset.entryId;
    if (!entryId) {
      return;
    }

    vscode.postMessage({
      type: 'openEntry',
      payload: {
        entryId
      }
    });
  });

  window.addEventListener('message', (event) => {
    const payload = event.data?.payload;
    if (event.data?.type !== 'state' || !payload) {
      return;
    }

    renderState(payload);
  });

  vscode.postMessage({ type: 'ready' });
}

function renderState(payload) {
  currentQuery = payload.query ?? '';

  if (elements.searchInput.value !== currentQuery) {
    elements.searchInput.value = currentQuery;
  }

  elements.summary.textContent = payload.summary ?? '';
  elements.summary.dataset.status = payload.status ?? 'no match';
  elements.refreshButton.disabled = Boolean(payload.loading);
  elements.refreshButton.textContent = payload.loading ? 'Reloading...' : 'Reload';
  elements.errorBanner.textContent = payload.error ?? '';
  elements.errorBanner.classList.toggle('hidden', !payload.error);

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  elements.emptyState.classList.toggle('hidden', entries.length > 0 || Boolean(payload.error) || Boolean(payload.loading));
  renderEntries(entries);
}

function renderEntries(entries) {
  elements.list.innerHTML = '';

  const fragment = document.createDocumentFragment();

  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `log-item level-${String(entry.level ?? 'info').toLowerCase()}`;
    button.dataset.entryId = String(entry.id ?? '');
    button.innerHTML = `
      <span class="log-item-head">
        <span class="log-time">${escapeHtml(String(entry.timestamp ?? ''))}</span>
      </span>
      <span class="log-label">${escapeHtml(String(entry.label ?? ''))}</span>
    `;
    fragment.appendChild(button);
  }

  elements.list.appendChild(fragment);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

init();
