import type { LogEntry } from '../../domain/log-entry';

const DEFAULT_LABEL_MAX_LENGTH = 72;

export function formatSidebarLogLabel(entry: Pick<LogEntry, 'level' | 'message'>, maxLength = DEFAULT_LABEL_MAX_LENGTH): string {
  const prefix = `${entry.level}: `;
  const normalizedMessage = entry.message.replace(/\s+/g, ' ').trim() || '(empty message)';

  if (prefix.length + normalizedMessage.length <= maxLength) {
    return `${prefix}${normalizedMessage}`;
  }

  const available = Math.max(maxLength - prefix.length - 1, 0);
  const truncatedMessage = normalizedMessage.slice(0, available).trimEnd();
  return `${prefix}${truncatedMessage}…`;
}

export function filterSidebarEntries(entries: readonly LogEntry[], query: string): LogEntry[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [...entries].sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
  }

  return entries
    .filter((entry) => buildSidebarSearchHaystack(entry).includes(normalizedQuery))
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
}

export function formatLogEntryDetailDocument(entry: LogEntry): string {
  const lines = [
    'Laravel Log Details',
    '===================',
    '',
    `Timestamp: ${entry.timestamp.toISOString()}`,
    `Level: ${entry.level}`,
    `Channel: ${entry.channel}`,
    `Source: ${entry.sourceFile}:${entry.sourceLine}`,
    `Request ID: ${entry.requestId ?? '-'}`,
    `User ID: ${entry.userId ?? '-'}`,
    `Job ID: ${entry.jobId ?? '-'}`,
    '',
    'Message',
    '-------',
    entry.message,
    '',
    'Context JSON',
    '------------',
    entry.context ? JSON.stringify(entry.context, null, 2) : '-',
    '',
    'Stack Trace',
    '-----------',
    entry.stackTrace || '-',
    '',
    'Raw',
    '---',
    entry.raw
  ];

  return lines.join('\n');
}

function buildSidebarSearchHaystack(entry: LogEntry): string {
  return [
    entry.level,
    entry.channel,
    entry.message,
    entry.raw,
    entry.stackTrace ?? '',
    entry.requestId ?? '',
    entry.userId ?? '',
    entry.jobId ?? '',
    entry.context ? JSON.stringify(entry.context) : ''
  ]
    .join('\n')
    .toLowerCase();
}
