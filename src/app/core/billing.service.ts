import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Id, OrgBilling, PlansResponse, PlatformPlan } from './models';

@Injectable({ providedIn: 'root' })
export class BillingService {
  private api = inject(ApiService);

  plans(): Observable<PlansResponse> {
    return this.api.get<PlansResponse>('billing/plans/');
  }
  organization(orgId: Id): Observable<OrgBilling> {
    return this.api.get<OrgBilling>(`billing/organizations/${orgId}/`);
  }
  /** Returns the Stripe Checkout URL; redirect the browser there. */
  checkout(orgId: Id, planId: Id): Observable<{ url: string }> {
    return this.api.post<{ url: string }>(`billing/organizations/${orgId}/checkout/`, { plan: planId });
  }
  /** Returns the Stripe Customer Portal URL. */
  portal(orgId: Id): Observable<{ url: string }> {
    return this.api.post<{ url: string }>(`billing/organizations/${orgId}/portal/`);
  }

  /* superadmin */
  platformPlans(): Observable<PlatformPlan[]> {
    return this.api.get<PlatformPlan[]>('platform/plans/');
  }
  createPlan(data: Partial<PlatformPlan>): Observable<PlatformPlan> {
    return this.api.post<PlatformPlan>('platform/plans/', data);
  }
  updatePlan(id: Id, data: Partial<PlatformPlan>): Observable<PlatformPlan> {
    return this.api.patch<PlatformPlan>(`platform/plans/${id}/`, data);
  }
  deletePlan(id: Id): Observable<void> {
    return this.api.delete(`platform/plans/${id}/`);
  }
  createStripePrice(id: Id, body: { amount_cents: number; currency: string; interval: 'month' | 'year' }): Observable<PlatformPlan> {
    return this.api.post<PlatformPlan>(`platform/plans/${id}/stripe-price/`, body);
  }
}
