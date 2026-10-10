import { Pipe, PipeTransform } from '@angular/core';
import { fmtNumber, fmtPercent } from '../utils/format';

@Pipe({ name: 'num' })
export class NumPipe implements PipeTransform {
  transform(value: number | null | undefined, compact = true): string {
    return fmtNumber(value, { compact });
  }
}

@Pipe({ name: 'pct' })
export class PctPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 1): string {
    return fmtPercent(value, digits);
  }
}
