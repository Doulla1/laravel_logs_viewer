const test = require('node:test');
const assert = require('node:assert/strict');

const { formatDatePart, formatTimePart, parseDateTimeParts } = require('../media/date-time-input.js');

test('date-time picker helpers format native date and time values', () => {
  const date = new Date(2026, 2, 30, 7, 5, 0, 0);

  assert.equal(formatDatePart(date), '2026-03-30');
  assert.equal(formatTimePart(date), '07:05');
});

test('parseDateTimeParts accepts native picker values and fallback times', () => {
  const parsed = parseDateTimeParts('2026-03-30', '17:45', { fallbackTime: '00:00' });

  assert.ok(parsed instanceof Date);
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 2);
  assert.equal(parsed.getDate(), 30);
  assert.equal(parsed.getHours(), 17);
  assert.equal(parsed.getMinutes(), 45);

  const fallback = parseDateTimeParts('2026-03-30', '', { fallbackTime: '23:59' });
  assert.ok(fallback instanceof Date);
  assert.equal(fallback.getHours(), 23);
  assert.equal(fallback.getMinutes(), 59);

  assert.equal(parseDateTimeParts('2026-02-31', '09:30', { fallbackTime: '00:00' }), null);
  assert.equal(parseDateTimeParts('30/03/2026', '09:30', { fallbackTime: '00:00' }), null);
  assert.equal(parseDateTimeParts('2026-03-30', '24:01', { fallbackTime: '00:00' }), null);
});
