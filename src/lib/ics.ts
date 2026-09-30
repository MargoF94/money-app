// Calendar files (.ics) for bills and card withdrawals, with an alert the day before at 9:00.
// The iPhone Calendar keeps the alerts, so they work while this app is closed.
import type { Bill } from './types';
import { addDays } from './util';

const text = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes are folded, as the format requires. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export interface CalEvent {
  uid: string;
  date: string; // YYYY-MM-DD, all day
  title: string;
  note?: string;
  rrule?: string;
}

export function billRule(b: Bill): string {
  if (b.repeat === 'yearly') return 'FREQ=YEARLY';
  const day = +b.start.slice(8, 10);
  const until = b.end ? `;UNTIL=${b.end.replace(/-/g, '')}` : '';
  return `FREQ=MONTHLY${b.every && b.every > 1 ? `;INTERVAL=${b.every}` : ''};BYMONTHDAY=${day === 31 ? -1 : day}${until}`;
}

export function toIcs(events: CalEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Money Log//Bills//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@money-log`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`,
      `SUMMARY:${text(e.title)}`,
      ...(e.note ? [`DESCRIPTION:${text(e.note)}`] : []),
      ...(e.rrule ? [`RRULE:${e.rrule}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${text(e.title)}`,
      'TRIGGER:-PT15H', // 9:00 the day before
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Downloads an .ics file; the iPhone offers to add the events to Calendar. */
export function downloadIcs(ics: string, name: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
