import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { PlatformInfoService } from './platform-info.service';

/** Route titles are written as "Page · Markette"; swap in the configured instance name. */
@Injectable({ providedIn: 'root' })
export class InstanceTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly info = inject(PlatformInfoService);
  private last = 'Markette';

  constructor() {
    super();
    effect(() => {
      const name = this.info.instanceName();
      this.title.setTitle(this.apply(this.last, name));
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.last = this.buildTitle(snapshot) ?? 'Markette';
    this.title.setTitle(this.apply(this.last, this.info.instanceName()));
  }

  private apply(raw: string, name: string): string {
    return raw.replace(/Markette/g, name);
  }
}
