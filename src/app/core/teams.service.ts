import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Id, Team, TeamMember, TeamRole } from './models';

/** Workspace teams (channel access + approval). */
@Injectable({ providedIn: 'root' })
export class TeamsService {
  private api = inject(ApiService);

  list(): Observable<Team[]> {
    return this.api.get<Team[]>('teams/');
  }
  create(data: Partial<Pick<Team, 'name' | 'description' | 'color' | 'requires_approval' | 'channels'>>): Observable<Team> {
    return this.api.post<Team>('teams/', data);
  }
  update(id: Id, data: Partial<Pick<Team, 'name' | 'description' | 'color' | 'requires_approval' | 'channels'>>): Observable<Team> {
    return this.api.patch<Team>(`teams/${id}/`, data);
  }
  remove(id: Id): Observable<void> {
    return this.api.delete(`teams/${id}/`);
  }
  addMember(teamId: Id, email: string, role: TeamRole): Observable<TeamMember> {
    return this.api.post<TeamMember>(`teams/${teamId}/members/`, { email, role });
  }
  updateMember(teamId: Id, memberId: Id, role: TeamRole): Observable<TeamMember> {
    return this.api.patch<TeamMember>(`teams/${teamId}/members/${memberId}/`, { role });
  }
  removeMember(teamId: Id, memberId: Id): Observable<void> {
    return this.api.delete(`teams/${teamId}/members/${memberId}/`);
  }
}
