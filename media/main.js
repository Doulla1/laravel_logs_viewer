const vscode = acquireVsCodeApi();

const ROW_HEIGHT = 52;
const OVERSCAN = 12;

const state = {
  status: 'indexing...',
  entries: [],
  filteredEntries: [],
  selectedId: null,
  sortDirection: 'desc',
  searchDebounceMs: 180,
  tailEnabled: false,
  totalBytes: 0,
  currentFiles: [],
  currentSource: {
    kind: 'workspace',
    label: 'Workspace logs',
    canTail: true
  },
  pastePanelOpen: false,
  filters: {
    text: '',
    levels: new Set(['ERROR', 'WARNING', 'INFO']),
    preset: '24h',
    start: null,
    end: null
  }
};

const elements = {
  searchInput: document.getElementById('searchInput'),
  startDateInput: document.getElementById('startDateInput'),
  endDateInput: document.getElementById('endDateInput'),
  levelChips: document.getElementById('levelChips'),
  datePresets: document.getElementById('datePresets'),
  refreshButton: document.getElementById('refreshButton'),
  tailButton: document.getElementById('tailButton'),
  sortButton: document.getElementById('sortButton'),
  workspaceSourceButton: document.getElementById('workspaceSourceButton'),
  importFileButton: document.getElementById('importFileButton'),
  pasteSourceButton: document.getElementById('pasteSourceButton'),
  pastePanel: document.getElementById('pastePanel'),
  pasteInput: document.getElementById('pasteInput'),
  loadPastedLogsButton: document.getElementById('loadPastedLogsButton'),
  clearPastedLogsButton: document.getElementById('clearPastedLogsButton'),
  statusBadge: document.getElementById('statusBadge'),
  resultCount: document.getElementById('resultCount'),
  sourceSummary: document.getElementById('sourceSummary'),
  fileSummary: document.getElementById('fileSummary'),
  sizeSummary: document.getElementById('sizeSummary'),
  emptyState: document.getElementById('emptyState'),
  listViewport: document.getElementById('listViewport'),
  listSpacer: document.getElementById('listSpacer'),
  listItems: document.getElementById('listItems'),
  detailMeta: document.getElementById('detailMeta'),
  detailContent: document.getElementById('detailContent'),
  contextContent: document.getElementById('contextContent'),
  stackTraceContent: document.getElementById('stackTraceContent'),
  copyLineButton: document.getElementById('copyLineButton'),
  copyJsonButton: document.getElementById('copyJsonButton')
};

let scheduleSearch = createSearchScheduler();
const copyResetTimers = new Map();

function init() {
  attachEvents();
  applyDatePreset('24h');
  applyFilters();
  vscode.postMessage({ type: 'ready' });
}

function attachEvents() {
  elements.searchInput.addEventListener('input', (event) => {
    const target = event.target;
    scheduleSearch(target.value ?? '');
  });

  elements.startDateInput.addEventListener('change', () => {
    state.filters.start = elements.startDateInput.value ? new Date(elements.startDateInput.value) : null;
    selectDatePreset('custom');
    applyFilters();
  });

  elements.endDateInput.addEventListener('change', () => {
    state.filters.end = elements.endDateInput.value ? new Date(elements.endDateInput.value) : null;
    selectDatePreset('custom');
    applyFilters();
  });

  elements.levelChips.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const level = target.dataset.level;
    if (!level) {
      return;
    }

    if (state.filters.levels.has(level)) {
      state.filters.levels.delete(level);
      target.classList.remove('active');
    } else {
      state.filters.levels.add(level);
      target.classList.add('active');
    }

    applyFilters();
  });

  elements.datePresets.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const preset = target.dataset.preset;
    if (!preset) {
      return;
    }

    applyDatePreset(preset);
    applyFilters();
  });

  elements.refreshButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });

  elements.tailButton.addEventListener('click', () => {
    if (elements.tailButton.disabled) {
      return;
    }

    const next = !state.tailEnabled;
    vscode.postMessage({ type: 'toggleTail', payload: { enabled: next } });
  });

  elements.workspaceSourceButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'switchSource', payload: { kind: 'workspace' } });
  });

  elements.importFileButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'pickImportedFile' });
  });

  elements.pasteSourceButton.addEventListener('click', () => {
    setPastePanelOpen(true);
    elements.pasteInput.focus();
  });

  elements.loadPastedLogsButton.addEventListener('click', () => {
    const text = elements.pasteInput.value.trim();
    if (!text) {
      flashButton(elements.loadPastedLogsButton, 'Paste logs first');
      elements.pasteInput.focus();
      return;
    }

    vscode.postMessage({
      type: 'applyPastedLogs',
      payload: {
        text: elements.pasteInput.value
      }
    });
  });

  elements.clearPastedLogsButton.addEventListener('click', () => {
    elements.pasteInput.value = '';

    if (state.currentSource.kind !== 'pastedLogs') {
      setPastePanelOpen(false);
    }
  });

  elements.sortButton.addEventListener('click', () => {
    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    elements.sortButton.dataset.direction = state.sortDirection;
    elements.sortButton.textContent = `Sort: ${state.sortDirection.toUpperCase()}`;
    applyFilters();
  });

  elements.listViewport.addEventListener('scroll', () => {
    renderVisibleRows();
  });

  elements.listItems.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const row = target.closest('.log-row');
    if (!(row instanceof HTMLElement)) {
      return;
    }

    const id = row.dataset.id;
    if (!id) {
      return;
    }

    state.selectedId = id;
    renderVisibleRows();
    renderDetails();
  });

  elements.copyLineButton.addEventListener('click', () => {
    const selected = getSelectedEntry();
    if (!selected) {
      return;
    }

    vscode.postMessage({ type: 'copyLine', payload: { text: selected.raw } });
  });

  elements.copyJsonButton.addEventListener('click', () => {
    const selected = getSelectedEntry();
    if (!selected?.context) {
      return;
    }

    vscode.postMessage({ type: 'copyJson', payload: { json: selected.context } });
  });
}

function createSearchScheduler() {
  return debounce((value) => {
    state.filters.text = value;
    applyFilters();
  }, state.searchDebounceMs);
}

function applyDatePreset(preset) {
  state.filters.preset = preset;
  selectDatePreset(preset);

  if (preset === 'custom') {
    return;
  }

  refreshActivePresetRange();
}

function refreshActivePresetRange() {
  const duration = getPresetDuration(state.filters.preset);
  if (!duration) {
    return;
  }

  const now = Date.now();
  state.filters.end = new Date(now);
  state.filters.start = new Date(now - duration);
  syncDateInputs();
}

function getPresetDuration(preset) {
  const durations = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000
  };

  return durations[preset];
}

function selectDatePreset(preset) {
  state.filters.preset = preset;

  Array.from(elements.datePresets.querySelectorAll('.chip')).forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.preset === preset);
  });
}

function applyFilters() {
  const query = state.filters.text.trim().toLowerCase();

  state.filteredEntries = state.entries
    .filter((entry) => state.filters.levels.size === 0 || state.filters.levels.has(entry.level))
    .filter((entry) => {
      const timestamp = new Date(entry.timestamp).getTime();

      if (state.filters.start && timestamp < state.filters.start.getTime()) {
        return false;
      }

      if (state.filters.end && timestamp > state.filters.end.getTime()) {
        return false;
      }

      return true;
    })
    .filter((entry) => {
      if (!query) {
        return true;
      }

      const haystack = `${entry.message}\n${entry.raw}\n${entry.stackTrace ?? ''}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((left, right) => {
      const leftTs = new Date(left.timestamp).getTime();
      const rightTs = new Date(right.timestamp).getTime();
      return state.sortDirection === 'asc' ? leftTs - rightTs : rightTs - leftTs;
    });

  elements.resultCount.textContent = `${state.filteredEntries.length} results`;
  elements.emptyState.classList.toggle('hidden', state.filteredEntries.length > 0);

  if (!state.filteredEntries.some((entry) => entry.id === state.selectedId)) {
    state.selectedId = state.filteredEntries[0]?.id ?? null;
  }

  renderVisibleRows();
  renderDetails();
}

function renderVisibleRows() {
  const total = state.filteredEntries.length;
  const viewportHeight = elements.listViewport.clientHeight;
  const scrollTop = elements.listViewport.scrollTop;

  const startIndex = Math.max(Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN, 0);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + 2 * OVERSCAN;
  const endIndex = Math.min(startIndex + visibleCount, total);

  elements.listSpacer.style.height = `${Math.max(total * ROW_HEIGHT, viewportHeight)}px`;
  elements.listItems.innerHTML = '';

  const fragment = document.createDocumentFragment();

  for (let index = startIndex; index < endIndex; index += 1) {
    const entry = state.filteredEntries[index];
    const row = document.createElement('article');
    row.className = `log-row${entry.id === state.selectedId ? ' selected' : ''}`;
    row.dataset.id = entry.id;
    row.style.top = `${index * ROW_HEIGHT}px`;

    row.innerHTML = `
      <span class="timestamp">${new Date(entry.timestamp).toLocaleString()}</span>
      <span class="level ${entry.level.toLowerCase()}">${entry.level}</span>
      <span class="message">
        ${highlightMessage(entry.message)}
        ${renderInlineIds(entry)}
      </span>
    `;

    fragment.appendChild(row);
  }

  elements.listItems.appendChild(fragment);
}

function renderDetails() {
  const entry = getSelectedEntry();

  if (!entry) {
    elements.detailMeta.textContent =
      state.filteredEntries.length === 0 ? renderEmptyMessage() : 'Select a log entry to inspect details.';
    elements.detailContent.textContent = '-';
    elements.contextContent.textContent = '-';
    elements.stackTraceContent.textContent = '-';
    elements.copyLineButton.disabled = true;
    elements.copyJsonButton.disabled = true;
    return;
  }

  elements.detailMeta.textContent =
    `${entry.level} ${entry.channel} ${new Date(entry.timestamp).toLocaleString()} ` +
    `${entry.sourceFile}:${entry.sourceLine}${renderDetailIds(entry)}`;
  elements.detailContent.textContent = entry.raw;
  elements.contextContent.textContent = entry.context ? JSON.stringify(entry.context, null, 2) : '-';
  elements.stackTraceContent.textContent = entry.stackTrace || '-';
  elements.copyLineButton.disabled = false;
  elements.copyJsonButton.disabled = !entry.context;
}

function updateMeta() {
  elements.statusBadge.textContent = state.status;
  elements.statusBadge.dataset.status = state.status;
  elements.sourceSummary.textContent = state.currentSource.label;
  elements.tailButton.disabled = !state.currentSource.canTail;
  elements.tailButton.classList.toggle('active', state.tailEnabled && state.currentSource.canTail);
  elements.tailButton.textContent = state.currentSource.canTail ? `Tail: ${state.tailEnabled ? 'ON' : 'OFF'}` : 'Tail unavailable';
  elements.sortButton.dataset.direction = state.sortDirection;
  elements.sortButton.textContent = `Sort: ${state.sortDirection.toUpperCase()}`;
  elements.workspaceSourceButton.classList.toggle('active', state.currentSource.kind === 'workspace');
  elements.importFileButton.classList.toggle('active', state.currentSource.kind === 'importedFile');
  elements.pasteSourceButton.classList.toggle('active', state.currentSource.kind === 'pastedLogs' || state.pastePanelOpen);
  elements.fileSummary.textContent = renderFileSummary();
  elements.sizeSummary.textContent = `${(state.totalBytes / (1024 * 1024)).toFixed(2)} MB`;
  elements.emptyState.textContent = renderEmptyMessage();
}

function renderFileSummary() {
  if (state.currentSource.kind === 'pastedLogs') {
    return 'Virtual source from pasted logs';
  }

  if (state.currentFiles.length === 0) {
    return state.currentSource.kind === 'importedFile' ? 'No imported file loaded' : 'No files loaded';
  }

  if (state.currentSource.kind === 'importedFile') {
    return `Imported file: ${state.currentFiles[0]}`;
  }

  return `${state.currentFiles.length} file(s) loaded`;
}

function renderEmptyMessage() {
  if (state.status === 'indexing...') {
    return 'Indexing log files...';
  }

  if (state.status === 'no match') {
    if (state.currentSource.kind === 'pastedLogs') {
      return 'Paste logs above to format and inspect them.';
    }

    return 'No Laravel log files matched the configured glob.';
  }

  if (state.filteredEntries.length === 0) {
    return state.currentSource.kind === 'pastedLogs'
      ? 'No parsed log entry matches the current filters.'
      : 'No match for current filters.';
  }

  return 'No entries available.';
}

function syncDateInputs() {
  elements.startDateInput.value = state.filters.start ? toDateTimeLocalValue(state.filters.start) : '';
  elements.endDateInput.value = state.filters.end ? toDateTimeLocalValue(state.filters.end) : '';
}

function toDateTimeLocalValue(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function highlightMessage(message) {
  let rendered = escapeHtml(message);
  const query = state.filters.text.trim();

  if (query) {
    const pattern = new RegExp(escapeRegExp(query), 'gi');
    rendered = rendered.replace(pattern, (match) => `<mark>${match}</mark>`);
  }

  const idPattern = /(request[_-]?id\s*[:=]\s*[\w-]+|user[_-]?id\s*[:=]\s*[\w-]+|job[_-]?id\s*[:=]\s*[\w-]+)/gi;
  rendered = rendered.replace(idPattern, (match) => `<mark class="id">${match}</mark>`);

  return rendered;
}

function renderInlineIds(entry) {
  const items = [];

  if (entry.requestId) {
    items.push(`<mark class="id">request_id=${escapeHtml(entry.requestId)}</mark>`);
  }

  if (entry.userId) {
    items.push(`<mark class="id">user_id=${escapeHtml(entry.userId)}</mark>`);
  }

  if (entry.jobId) {
    items.push(`<mark class="id">job_id=${escapeHtml(entry.jobId)}</mark>`);
  }

  return items.length > 0 ? ` <span class="row-ids">${items.join(' ')}</span>` : '';
}

function renderDetailIds(entry) {
  const ids = [];

  if (entry.requestId) {
    ids.push(`request_id=${entry.requestId}`);
  }

  if (entry.userId) {
    ids.push(`user_id=${entry.userId}`);
  }

  if (entry.jobId) {
    ids.push(`job_id=${entry.jobId}`);
  }

  return ids.length > 0 ? ` | ${ids.join(' | ')}` : '';
}

function setPastePanelOpen(open) {
  state.pastePanelOpen = open;
  elements.pastePanel.classList.toggle('hidden', !open);
  updateMeta();
}

function flashButton(button, label) {
  const initialLabel = button.dataset.defaultLabel ?? button.textContent ?? '';
  const wasActive = button.classList.contains('active') ? 'true' : 'false';
  button.dataset.defaultLabel = initialLabel;
  button.dataset.wasActive = wasActive;
  button.textContent = label;
  button.classList.add('active');

  const existingTimer = copyResetTimers.get(button.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    button.textContent = initialLabel;
    if (button.dataset.wasActive !== 'true') {
      button.classList.remove('active');
    }
    copyResetTimers.delete(button.id);
  }, 1200);

  copyResetTimers.set(button.id, timer);
}

function showCopyFeedback(kind) {
  if (kind === 'json') {
    flashButton(elements.copyJsonButton, 'Copied JSON');
    return;
  }

  flashButton(elements.copyLineButton, 'Copied line');
}

function getSelectedEntry() {
  return state.filteredEntries.find((entry) => entry.id === state.selectedId) ?? null;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function debounce(fn, delay) {
  let timer = undefined;

  return (...args) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

window.addEventListener('message', (event) => {
  const { data } = event;
  const payload = data?.payload ?? {};

  if (data?.type === 'loadingState') {
    state.status = payload.status ?? 'indexing...';
    updateMeta();
    return;
  }

  if (data?.type === 'tailStateUpdated') {
    state.tailEnabled = Boolean(payload.tailEnabled);
    updateMeta();
    return;
  }

  if (data?.type === 'copyCompleted') {
    showCopyFeedback(payload.kind);
    return;
  }

  if (data?.type !== 'initData' && data?.type !== 'entriesUpdated') {
    return;
  }

  state.status = payload.status ?? 'live';
  state.entries = payload.entries ?? [];
  state.tailEnabled = Boolean(payload.tailEnabled);
  state.searchDebounceMs = payload.searchDebounceMs ?? 180;
  state.totalBytes = payload.totalBytes ?? 0;
  state.currentFiles = payload.currentFiles ?? [];
  state.currentSource = payload.source ?? state.currentSource;
  scheduleSearch = createSearchScheduler();

  if (state.currentSource.kind === 'pastedLogs') {
    setPastePanelOpen(true);
  }

  if (state.filters.preset !== 'custom') {
    refreshActivePresetRange();
  } else {
    syncDateInputs();
  }

  updateMeta();
  applyFilters();
});

init();
