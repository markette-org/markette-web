import { Injectable, inject } from '@angular/core';
import { isNative } from './native/platform';
import { storage } from './storage';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Channel, Id, Invitation, OrgMember, OrgRole, Organization, SsoConfig, SsoConfigWrite } from './models';

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private api = inject(ApiService);

  get(id: Id): Observable<Organization> {
    return this.api.get<Organization>(`organizations/${id}/`);
  }
  update(id: Id, patch: { name: string }): Observable<Organization> {
    return this.api.patch<Organization>(`organizations/${id}/`, patch);
  }
  members(id: Id): Observable<OrgMember[]> {
    return this.api.get<OrgMember[]>(`organizations/${id}/members/`);
  }
  updateMember(id: Id, memberId: Id, role: OrgRole): Observable<OrgMember> {
    return this.api.patch<OrgMember>(`organizations/${id}/members/${memberId}/`, { role });
  }
  removeMember(id: Id, memberId: Id): Observable<void> {
    return this.api.delete(`organizations/${id}/members/${memberId}/`);
  }
  invitations(id: Id): Observable<Invitation[]> {
    return this.api.get<Invitation[]>(`organizations/${id}/invitations/`);
  }
  invite(id: Id, email: string, orgRole: OrgRole): Observable<Invitation> {
    return this.api.post<Invitation>(`organizations/${id}/invitations/`, { email, org_role: orgRole });
  }
  revokeInvitation(id: Id, invitationId: Id): Observable<void> {
    return this.api.delete(`organizations/${id}/invitations/${invitationId}/`);
  }

  /* shared channels */
  channels(id: Id): Observable<Channel[]> {
    return this.api.get<Channel[]>(`organizations/${id}/channels/`);
  }
  shareChannel(id: Id, channelId: Id, workspaces: Id[]): Observable<Channel> {
    return this.api.patch<Channel>(`organizations/${id}/channels/${channelId}/`, { workspaces });
  }
  disconnectChannel(id: Id, channelId: Id): Observable<void> {
    return this.api.delete(`organizations/${id}/channels/${channelId}/`);
  }

  /* single sign-on (owners) */
  sso(id: Id): Observable<SsoConfig> {
    return this.api.get<SsoConfig>(`organizations/${id}/sso/`);
  }
  saveSso(id: Id, data: SsoConfigWrite): Observable<SsoConfig> {
    return this.api.put<SsoConfig>(`organizations/${id}/sso/`, data);
  }
  addSsoDomain(id: Id, domain: string): Observable<SsoConfig> {
    return this.api.post<SsoConfig>(`organizations/${id}/sso/domains/`, { domain });
  }
  verifySsoDomain(id: Id, domainId: Id): Observable<SsoConfig> {
    return this.api.post<SsoConfig>(`organizations/${id}/sso/domains/${domainId}/verify/`);
  }
  removeSsoDomain(id: Id, domainId: Id): Observable<SsoConfig> {
    return this.api.delete<SsoConfig>(`organizations/${id}/sso/domains/${domainId}/`);
  }
}

export function inviteLink(token: string, email?: string, origin = defaultOrigin()): string {
  const q = new URLSearchParams({ invitation: token });
  if (email) q.set('email', email);
  return `${origin}/register?${q.toString()}`;
}

/** Public origin for links (the chosen server in the native app). */
function defaultOrigin(): string {
  const stored = isNative() ? storage.get('markette.server') : null;
  return stored || location.origin;
}
