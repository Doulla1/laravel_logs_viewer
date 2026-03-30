(function (globalScope) {
  function pad(value) {
    return `${value}`.padStart(2, '0');
  }

  function formatDatePart(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function formatTimePart(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }

    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function parseDateTimeParts(dateValue, timeValue, options) {
    const dateTrimmed = `${dateValue ?? ''}`.trim();
    if (!dateTrimmed) {
      return null;
    }

    const dateMatch = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(dateTrimmed);
    if (!dateMatch?.groups) {
      return null;
    }

    const fallbackTime = options?.fallbackTime ?? '00:00';
    const timeTrimmed = `${timeValue ?? ''}`.trim() || fallbackTime;
    const timeMatch = /^(?<hours>\d{2}):(?<minutes>\d{2})$/.exec(timeTrimmed);
    if (!timeMatch?.groups) {
      return null;
    }

    const day = Number.parseInt(dateMatch.groups.day, 10);
    const month = Number.parseInt(dateMatch.groups.month, 10);
    const year = Number.parseInt(dateMatch.groups.year, 10);
    const hours = Number.parseInt(timeMatch.groups.hours, 10);
    const minutes = Number.parseInt(timeMatch.groups.minutes, 10);

    if (month < 1 || month > 12 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day ||
      parsed.getHours() !== hours ||
      parsed.getMinutes() !== minutes
    ) {
      return null;
    }

    return parsed;
  }

  const api = {
    formatDatePart,
    formatTimePart,
    parseDateTimeParts
  };

  globalScope.DateTimeInput = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
