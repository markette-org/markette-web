import { Pipe, PipeTransform, inject } from '@angular/core';
import { WorkspaceService } from '../../core/workspace.service';
import { formatInTz, relativeTime } from '../utils/dates';

const PRESETS: Record<string, Intl.DateTimeFormatOptions> = {
  datetime: { dateStyle: 'medium', timeStyle: 'short' },
  short: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  date: { dateStyle: 'medium' },
  day: { weekday: 'short', month: 'short', day: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit' },
  full: { dateStyle: 'full', timeStyle: 'short' },
};

/** Formats an instant in the active workspace's time zone: {{ iso | tzDate:'short' }}. */
@Pipe({ name: 'tzDate' })
export class TzDatePipe implements PipeTransform {
  private ws = inject(WorkspaceService);
  transform(value: string | Date | null | undefined, preset: keyof typeof PRESETS | string = 'datetime', tz?: string): string {
    return formatInTz(value, tz || this.ws.timezone(), PRESETS[preset] ?? PRESETS['datetime']);
  }
}

@Pipe({ name: 'relTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return relativeTime(value);
  }
}
