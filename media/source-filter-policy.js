(function (globalScope) {
  const BOUNDED_PRESETS = new Set(['15m', '1h', '24h']);

  function cloneDate(value) {
    return value instanceof Date ? new Date(value.getTime()) : null;
  }

  function cloneDateFilter(filter) {
    return {
      preset: filter.preset,
      start: cloneDate(filter.start),
      end: cloneDate(filter.end)
    };
  }

  function rememberWorkspaceDateFilter(currentSource, currentDateFilter, workspaceDateFilter) {
    if (currentSource?.kind !== 'workspace') {
      return workspaceDateFilter ? cloneDateFilter(workspaceDateFilter) : null;
    }

    return cloneDateFilter(currentDateFilter);
  }

  function applySourceDateFilterTransition(previousSource, nextSource, currentDateFilter, workspaceDateFilter) {
    const savedWorkspaceDateFilter = workspaceDateFilter ? cloneDateFilter(workspaceDateFilter) : null;

    if (!previousSource || previousSource.activationId === nextSource.activationId) {
      return {
        dateFilter: cloneDateFilter(currentDateFilter),
        workspaceDateFilter: savedWorkspaceDateFilter,
        changed: false
      };
    }

    if (nextSource.kind === 'workspace') {
      if (!savedWorkspaceDateFilter) {
        return {
          dateFilter: cloneDateFilter(currentDateFilter),
          workspaceDateFilter: savedWorkspaceDateFilter,
          changed: false
        };
      }

      return {
        dateFilter: cloneDateFilter(savedWorkspaceDateFilter),
        workspaceDateFilter: savedWorkspaceDateFilter,
        changed: true
      };
    }

    if (!BOUNDED_PRESETS.has(currentDateFilter.preset)) {
      return {
        dateFilter: cloneDateFilter(currentDateFilter),
        workspaceDateFilter: savedWorkspaceDateFilter,
        changed: false
      };
    }

    const nextWorkspaceDateFilter =
      previousSource.kind === 'workspace' ? cloneDateFilter(currentDateFilter) : savedWorkspaceDateFilter;

    return {
      dateFilter: {
        preset: 'custom',
        start: null,
        end: null
      },
      workspaceDateFilter: nextWorkspaceDateFilter,
      changed: true
    };
  }

  const api = {
    applySourceDateFilterTransition,
    cloneDateFilter,
    rememberWorkspaceDateFilter
  };

  globalScope.SourceFilterPolicy = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
