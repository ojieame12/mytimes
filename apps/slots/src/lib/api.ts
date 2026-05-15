import type { BookingEvent, TimeSlot } from './types';
import type { WizardDraft } from './wizard';

const CREATED_EVENT_STORAGE_KEY = 'mytimes:slots:last-created-event:v1';

declare global {
  interface Window {
    __SLOTBOARD_API_URL__?: string;
  }
}

export type CreateEventResponse = {
  event: {
    id: string;
    title: string;
    description: string;
    organizerName: string;
    organizerEmail: string;
    avatarStyle?: BookingEvent['avatarStyle'];
    avatarSeed?: string;
    timezone: string;
    meetingDurationMinutes: number;
    intervalMinutes: number;
    allowMultipleBookings: boolean;
    status: 'active';
    planKey?: 'free' | 'event_pass' | 'company_standby';
    paymentStatus?: 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded';
    paidAt?: string;
    expiresAt?: string;
    bookingLimit?: number;
    slotLimit?: number;
    slotCount: number;
    createdAt: string;
  };
  links: {
    public: string;
    admin: string;
  };
  email?: {
    organizerLinks: EmailDeliveryResult;
  };
};

export type EmailDeliveryResult = {
  emailType: string;
  status: 'sent' | 'failed';
  provider?: 'console' | 'resend' | 'postmark';
  deliveryLogId?: string;
  providerMessageId?: string;
  error?: string;
};

export type PublicBoardResponse = {
  event: BookingEvent;
  slots: TimeSlot[];
};

export type BookingRecord = {
  id: string;
  eventId: string;
  slotId: string;
  participantName: string;
  participantEmail: string;
  participantTimezone?: string;
  participantLocale?: string;
  participantOffsetAtBooking?: string;
  notes: string;
  status: 'active' | 'cancelled';
  bookedAt: string;
  cancelledAt?: string;
  cancelledBy?: 'participant' | 'organizer';
  icsSequence: number;
};

export type ClaimSlotResponse = {
  event: BookingEvent;
  slot: TimeSlot;
  booking: BookingRecord;
  links: {
    manage: string;
  };
  email?: {
    participantConfirmation: EmailDeliveryResult;
    organizerNotice: EmailDeliveryResult;
  };
};

export type ManageBookingResponse = {
  event: BookingEvent;
  slot: TimeSlot;
  booking: BookingRecord;
};

export type ResendManagedBookingEmailResponse = ManageBookingResponse & {
  delivery: EmailDeliveryResult;
};

export type ManagedRescheduleOptionsResponse = ManageBookingResponse & {
  slots: TimeSlot[];
};

export type RescheduleManagedBookingResponse = ManageBookingResponse & {
  email?: {
    participantConfirmation: EmailDeliveryResult;
    organizerNotice: EmailDeliveryResult;
  };
};

export type OrganizerResendBookingEmailResponse = ManageBookingResponse & {
  links: {
    manage: string;
  };
  delivery: EmailDeliveryResult;
};

export type AdminDashboardResponse = {
  event: BookingEvent;
  slots: TimeSlot[];
};

export type RotatedPublicLinkResponse = {
  event: BookingEvent;
  links: {
    public: string;
  };
  shareMessage: string;
};

export type BillingReadinessResponse = {
  ok: true;
  billing: {
    provider: 'stripe';
    checkoutConfigured: boolean;
    webhookConfigured: boolean;
    productionReady: boolean;
    currency: string;
    products: {
      eventPass: {
        amount: number;
        displayPrice: string;
      };
      companyStandby: {
        amount: number;
        displayPrice: string;
        interval: 'month';
      };
      companyStandbyAnnual: {
        amount: number;
        displayPrice: string;
        interval: 'year';
      };
    };
    requiredVariables: string[];
    optionalVariables: string[];
    webhookPath: string;
    issues: string[];
  };
};

export type CheckoutResponse = {
  checkoutSessionId: string;
  url: string;
  mode: 'payment' | 'subscription';
  productKey: 'event_pass' | 'company_standby';
};

export type AccountBillingResponse = {
  customer: {
    provider: 'stripe';
    exists: boolean;
  };
  subscription?: {
    planKey: 'company_standby';
    status: string;
    active: boolean;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd: boolean;
  };
  canOpenPortal: boolean;
};

export type CustomerPortalResponse = {
  url: string;
};

export type CustomDomainStatus = 'pending_dns' | 'verified_dns' | 'active' | 'rejected';

export type CustomDomainSettingsResponse = {
  eligible: boolean;
  reason?: 'company_standby_required';
  cnameTarget: string;
  activation: {
    mode: 'railway_api' | 'ops_manual';
    automatic: boolean;
  };
  domain?: {
    id: string;
    hostname: string;
    status: CustomDomainStatus;
    verification: {
      type: 'TXT';
      name: string;
      value: string;
    };
    routing: {
      type: 'CNAME';
      name: string;
      value: string;
    };
    requestedAt: string;
    verifiedAt?: string;
    activatedAt?: string;
    lastCheckedAt?: string;
    lastCheckError?: string;
  };
};

export type AccountEventsResponse = {
  events: {
    event: BookingEvent;
    slotCount: number;
    activeBookingCount: number;
  }[];
};

export type MyBoardsResponse = {
  ownerEmail: string;
  expiresAt: string;
  boards: {
    id: string;
    title: string;
    status: 'active' | 'archived';
    planKey: 'free' | 'event_pass' | 'company_standby';
    paymentStatus: 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded';
    slotCount: number;
    openSlots: number;
    bookingCount: number;
    createdAt: string;
    expiresAt?: string;
  }[];
};

export type MyBoardsLinkRequestResponse = {
  ok: true;
  delivery?: EmailDeliveryResult;
};

export type MyBoardsAdminLinkResponse = {
  url: string;
};

export type OrganizerSessionResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
  };
};

export type OrganizerAuthResponse = {
  token?: string | null;
  redirect?: boolean;
  url?: string | null;
  user: OrganizerSessionResponse['user'];
  session?: OrganizerSessionResponse['session'];
};

export type AdminEventPatch = Partial<
  Pick<BookingEvent, 'title' | 'description' | 'organizerName' | 'organizerEmail'>
>;

export class ApiClientError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

export async function createEventFromDraft(draft: WizardDraft): Promise<CreateEventResponse> {
  return apiJson<CreateEventResponse>('/api/slotboard/events', {
    method: 'POST',
    body: {
      title: draft.title,
      description: draft.description,
      organizerName: draft.organizerName,
      organizerEmail: draft.organizerEmail,
      avatarStyle: draft.avatarStyle,
      timezone: draft.timezone,
      allowMultipleBookings: draft.allowMultipleBookings,
      availability: {
        startDate: draft.startDate,
        endDate: draft.endDate,
        weekdays: draft.weekdays,
        dailyStart: draft.dailyStart,
        dailyEnd: draft.dailyEnd,
        durationMinutes: draft.durationMinutes,
        intervalMinutes: draft.intervalMinutes,
        timezone: draft.timezone,
        blockedRanges: draft.blockedRanges,
        excludedSlotStarts: draft.excludedSlotStarts,
      },
    },
  });
}

export async function signUpOrganizer(input: {
  name: string;
  email: string;
  password: string;
}): Promise<OrganizerAuthResponse> {
  return apiJson<OrganizerAuthResponse>('/api/auth/sign-up/email', {
    method: 'POST',
    credentials: 'include',
    body: {
      ...input,
      callbackURL: emailVerificationCallbackURL(),
    },
  });
}

export async function signInOrganizer(input: {
  email: string;
  password: string;
}): Promise<OrganizerAuthResponse> {
  return apiJson<OrganizerAuthResponse>('/api/auth/sign-in/email', {
    method: 'POST',
    credentials: 'include',
    body: {
      ...input,
      callbackURL: emailVerificationCallbackURL(),
    },
  });
}

export async function signOutOrganizer(): Promise<unknown> {
  return apiJson<unknown>('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'include',
    body: {},
  });
}

export async function requestOrganizerPasswordReset(email: string): Promise<{ status: boolean; message: string }> {
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
  return apiJson<{ status: boolean; message: string }>('/api/auth/request-password-reset', {
    method: 'POST',
    credentials: 'include',
    body: redirectTo ? { email, redirectTo } : { email },
  });
}

export async function resetOrganizerPassword(input: {
  token: string;
  newPassword: string;
}): Promise<{ status: boolean }> {
  return apiJson<{ status: boolean }>('/api/auth/reset-password', {
    method: 'POST',
    credentials: 'include',
    body: input,
  });
}

export async function getOrganizerSession(): Promise<OrganizerSessionResponse | undefined> {
  const response = await fetch(`${apiBaseURL()}/api/auth/get-session`, {
    method: 'GET',
    credentials: 'include',
  });
  const text = await response.text();
  if (response.status === 401 || response.status === 204 || !text) {
    return undefined;
  }
  const data = parseJson(text);
  if (!response.ok) {
    const error =
      apiErrorFrom(data) ??
      { error: 'request_failed', message: `Request failed with status ${response.status}` };
    throw new ApiClientError(response.status, error.error ?? error.code ?? 'request_failed', error.message);
  }
  return data as OrganizerSessionResponse;
}

export async function readAccountEvents(): Promise<AccountEventsResponse> {
  return apiJson<AccountEventsResponse>('/api/slotboard/account/events', {
    credentials: 'include',
  });
}

export async function readAccountDashboard(eventId: string): Promise<AdminDashboardResponse> {
  return apiJson<AdminDashboardResponse>(`/api/slotboard/account/events/${encodeURIComponent(eventId)}`, {
    credentials: 'include',
  });
}

export async function readBillingReadiness(): Promise<BillingReadinessResponse> {
  return apiJson<BillingReadinessResponse>('/api/slotboard/billing/readiness');
}

export async function readAccountBilling(): Promise<AccountBillingResponse> {
  return apiJson<AccountBillingResponse>('/api/slotboard/billing/account', {
    credentials: 'include',
  });
}

export async function createCompanyStandbyCheckout(
  billingInterval: 'month' | 'year' = 'year',
): Promise<CheckoutResponse> {
  return apiJson<CheckoutResponse>('/api/slotboard/billing/company-standby/checkout', {
    method: 'POST',
    credentials: 'include',
    body: { billingInterval },
  });
}

export async function createCustomerPortalSession(): Promise<CustomerPortalResponse> {
  return apiJson<CustomerPortalResponse>('/api/slotboard/billing/customer-portal', {
    method: 'POST',
    credentials: 'include',
  });
}

export async function readAccountCustomDomain(): Promise<CustomDomainSettingsResponse> {
  return apiJson<CustomDomainSettingsResponse>('/api/slotboard/account/custom-domain', {
    credentials: 'include',
  });
}

export async function requestAccountCustomDomain(hostname: string): Promise<CustomDomainSettingsResponse> {
  return apiJson<CustomDomainSettingsResponse>('/api/slotboard/account/custom-domain', {
    method: 'POST',
    credentials: 'include',
    body: { hostname },
  });
}

export async function verifyAccountCustomDomain(): Promise<CustomDomainSettingsResponse> {
  return apiJson<CustomDomainSettingsResponse>('/api/slotboard/account/custom-domain/verify', {
    method: 'POST',
    credentials: 'include',
  });
}

export async function createAccountEventPassCheckout(eventId: string): Promise<CheckoutResponse> {
  return apiJson<CheckoutResponse>(
    `/api/slotboard/account/events/${encodeURIComponent(eventId)}/billing/event-pass/checkout`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
}

export async function rotateAccountPublicLink(eventId: string): Promise<RotatedPublicLinkResponse> {
  return apiJson<RotatedPublicLinkResponse>(
    `/api/slotboard/account/events/${encodeURIComponent(eventId)}/public-link/rotate`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
}

export async function updateAccountEvent(
  eventId: string,
  patch: AdminEventPatch,
): Promise<{ event: BookingEvent }> {
  return apiJson<{ event: BookingEvent }>(`/api/slotboard/account/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    credentials: 'include',
    body: patch,
  });
}

export async function archiveAccountEvent(eventId: string): Promise<{ event: BookingEvent }> {
  return apiJson<{ event: BookingEvent }>(
    `/api/slotboard/account/events/${encodeURIComponent(eventId)}/archive`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
}

export async function deleteAccountEvent(eventId: string): Promise<{ event: BookingEvent }> {
  return apiJson<{ event: BookingEvent }>(
    `/api/slotboard/account/events/${encodeURIComponent(eventId)}/delete`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
}

export async function setAccountSlotStatus(
  eventId: string,
  slotId: string,
  status: 'open' | 'closed',
): Promise<{ event: BookingEvent; slot: TimeSlot }> {
  return apiJson<{ event: BookingEvent; slot: TimeSlot }>(
    `/api/slotboard/account/events/${encodeURIComponent(eventId)}/slots/${slotId}/${status === 'closed' ? 'close' : 'reopen'}`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
}

export async function cancelBookingByAccount(
  eventId: string,
  bookingId: string,
  input: {
    reason: string;
    reopenSlot?: boolean;
  },
): Promise<{ event: BookingEvent; slot: TimeSlot; booking: BookingRecord }> {
  return apiJson<{ event: BookingEvent; slot: TimeSlot; booking: BookingRecord }>(
    `/api/slotboard/account/events/${encodeURIComponent(eventId)}/bookings/${bookingId}/cancel`,
    {
      method: 'POST',
      credentials: 'include',
      body: input,
    },
  );
}

export async function resendBookingEmailByAccount(
  eventId: string,
  bookingId: string,
): Promise<OrganizerResendBookingEmailResponse> {
  return apiJson<OrganizerResendBookingEmailResponse>(
    `/api/slotboard/account/events/${encodeURIComponent(eventId)}/bookings/${bookingId}/resend-email`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
}

export async function readPublicBoard(publicToken: string): Promise<PublicBoardResponse> {
  return apiJson<PublicBoardResponse>('/api/slotboard/book', {
    token: publicToken,
  });
}

export async function claimSlot(
  publicToken: string,
  input: {
    slotId: string;
    participantName: string;
    participantEmail: string;
    participantTimezone?: string;
    participantLocale?: string;
    participantOffsetAtBooking?: string;
    notes: string;
  },
  options: { idempotencyKey?: string } = {},
): Promise<ClaimSlotResponse> {
  return apiJson<ClaimSlotResponse>('/api/slotboard/book/claim', {
    method: 'POST',
    token: publicToken,
    idempotencyKey: options.idempotencyKey,
    body: input,
  });
}

export async function readManageBooking(manageToken: string): Promise<ManageBookingResponse> {
  return apiJson<ManageBookingResponse>('/api/slotboard/manage', {
    token: manageToken,
  });
}

export async function resendManagedBookingEmail(
  manageToken: string,
): Promise<ResendManagedBookingEmailResponse> {
  return apiJson<ResendManagedBookingEmailResponse>('/api/slotboard/manage/resend-email', {
    method: 'POST',
    token: manageToken,
  });
}

export async function readManagedRescheduleOptions(
  manageToken: string,
): Promise<ManagedRescheduleOptionsResponse> {
  return apiJson<ManagedRescheduleOptionsResponse>('/api/slotboard/manage/reschedule', {
    token: manageToken,
  });
}

export async function rescheduleManagedBooking(
  manageToken: string,
  input: {
    slotId: string;
    notes?: string;
    participantTimezone?: string;
    participantLocale?: string;
    participantOffsetAtBooking?: string;
  },
  options: { idempotencyKey?: string } = {},
): Promise<RescheduleManagedBookingResponse> {
  return apiJson<RescheduleManagedBookingResponse>('/api/slotboard/manage/reschedule', {
    method: 'POST',
    token: manageToken,
    idempotencyKey: options.idempotencyKey,
    body: input,
  });
}

export async function cancelManagedBooking(
  manageToken: string,
  input: {
    reason: string;
    reopenSlot?: boolean;
  },
): Promise<ManageBookingResponse> {
  return apiJson<ManageBookingResponse>('/api/slotboard/manage/cancel', {
    method: 'POST',
    token: manageToken,
    body: input,
  });
}

export async function readAdminDashboard(adminToken: string): Promise<AdminDashboardResponse> {
  return apiJson<AdminDashboardResponse>('/api/slotboard/admin', {
    token: adminToken,
  });
}

export async function createAdminEventPassCheckout(adminToken: string): Promise<CheckoutResponse> {
  return apiJson<CheckoutResponse>('/api/slotboard/billing/event-pass/checkout', {
    method: 'POST',
    token: adminToken,
  });
}

export async function rotateAdminPublicLink(adminToken: string): Promise<RotatedPublicLinkResponse> {
  return apiJson<RotatedPublicLinkResponse>('/api/slotboard/admin/public-link/rotate', {
    method: 'POST',
    token: adminToken,
  });
}

export async function updateAdminEvent(
  adminToken: string,
  patch: AdminEventPatch,
): Promise<{ event: BookingEvent }> {
  return apiJson<{ event: BookingEvent }>('/api/slotboard/admin/event', {
    method: 'PATCH',
    token: adminToken,
    body: patch,
  });
}

export async function archiveAdminEvent(adminToken: string): Promise<{ event: BookingEvent }> {
  return apiJson<{ event: BookingEvent }>('/api/slotboard/admin/archive', {
    method: 'POST',
    token: adminToken,
  });
}

export async function deleteAdminEvent(adminToken: string): Promise<{ event: BookingEvent }> {
  return apiJson<{ event: BookingEvent }>('/api/slotboard/admin/delete', {
    method: 'POST',
    token: adminToken,
  });
}

export async function setAdminSlotStatus(
  adminToken: string,
  slotId: string,
  status: 'open' | 'closed',
): Promise<{ event: BookingEvent; slot: TimeSlot }> {
  return apiJson<{ event: BookingEvent; slot: TimeSlot }>(
    `/api/slotboard/admin/slots/${slotId}/${status === 'closed' ? 'close' : 'reopen'}`,
    {
      method: 'POST',
      token: adminToken,
    },
  );
}

export async function cancelBookingByAdmin(
  adminToken: string,
  bookingId: string,
  input: {
    reason: string;
    reopenSlot?: boolean;
  },
): Promise<{ event: BookingEvent; slot: TimeSlot; booking: BookingRecord }> {
  return apiJson<{ event: BookingEvent; slot: TimeSlot; booking: BookingRecord }>(
    `/api/slotboard/admin/bookings/${bookingId}/cancel`,
    {
      method: 'POST',
      token: adminToken,
      body: input,
    },
  );
}

export async function resendBookingEmailByAdmin(
  adminToken: string,
  bookingId: string,
): Promise<OrganizerResendBookingEmailResponse> {
  return apiJson<OrganizerResendBookingEmailResponse>(
    `/api/slotboard/admin/bookings/${bookingId}/resend-email`,
    {
      method: 'POST',
      token: adminToken,
    },
  );
}

export async function recoverAdminLinks(organizerEmail: string): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>('/api/slotboard/recover', {
    method: 'POST',
    body: { organizerEmail },
  });
}

export async function requestMyBoardsLink(
  organizerEmail: string,
): Promise<MyBoardsLinkRequestResponse> {
  return apiJson<MyBoardsLinkRequestResponse>('/api/slotboard/my-boards/request', {
    method: 'POST',
    body: { organizerEmail },
  });
}

export async function readMyBoards(token: string): Promise<MyBoardsResponse> {
  return apiJson<MyBoardsResponse>('/api/slotboard/my-boards', {
    token,
  });
}

export async function createMyBoardsAdminLink(
  token: string,
  eventId: string,
): Promise<MyBoardsAdminLinkResponse> {
  return apiJson<MyBoardsAdminLinkResponse>(
    `/api/slotboard/my-boards/${encodeURIComponent(eventId)}/admin-link`,
    {
      method: 'POST',
      token,
    },
  );
}

export function adminCsvURL(adminToken: string): string {
  return `${apiBaseURL()}/api/slotboard/admin/${encodeURIComponent(adminToken)}/export.csv`;
}

export function accountCsvURL(eventId: string): string {
  return `${apiBaseURL()}/api/slotboard/account/events/${encodeURIComponent(eventId)}/export.csv`;
}

export function manageCalendarURL(manageToken: string): string {
  return `${apiBaseURL()}/api/slotboard/manage/${encodeURIComponent(manageToken)}/calendar.ics`;
}

export function storeCreatedEvent(value: CreateEventResponse): void {
  try {
    window.sessionStorage.setItem(CREATED_EVENT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Private mode or quota failures should not block navigation. */
  }
}

export function readStoredCreatedEvent(): CreateEventResponse | undefined {
  try {
    const raw = window.sessionStorage.getItem(CREATED_EVENT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CreateEventResponse) : undefined;
  } catch {
    return undefined;
  }
}

export function clearStoredCreatedEvent(): void {
  try {
    window.sessionStorage.removeItem(CREATED_EVENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function apiJson<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH';
    token?: string;
    idempotencyKey?: string;
    body?: unknown;
    credentials?: RequestCredentials;
  } = {},
): Promise<T> {
  const response = await fetch(`${apiBaseURL()}${path}`, {
    method: options.method ?? 'GET',
    headers: requestHeaders(options),
    credentials: options.credentials ?? 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? parseJson(text) : undefined;

  if (!response.ok) {
    const error =
      apiErrorFrom(data) ??
      { error: 'request_failed', message: `Request failed with status ${response.status}` };
    throw new ApiClientError(response.status, error.error ?? error.code ?? 'request_failed', error.message);
  }

  return data as T;
}

function requestHeaders(options: {
  token?: string;
  idempotencyKey?: string;
  body?: unknown;
}): HeadersInit {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }
  return headers;
}

function apiBaseURL(): string {
  const runtimeConfigured =
    typeof window === 'undefined' ? undefined : window.__SLOTBOARD_API_URL__;
  if (runtimeConfigured) {
    return runtimeConfigured.replace(/\/$/, '');
  }

  const configured = (import.meta as ImportMeta & {
    env?: { VITE_SLOTBOARD_API_URL?: string };
  }).env?.VITE_SLOTBOARD_API_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
    return `${window.location.protocol}//${window.location.hostname}:3014`;
  }

  return window.location.origin;
}

function emailVerificationCallbackURL(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/verify-email`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function apiErrorFrom(value: unknown): { error?: string; code?: string; message: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  if (typeof candidate.message !== 'string') return undefined;
  if (typeof candidate.error === 'string') {
    return { error: candidate.error, message: candidate.message };
  }
  if (typeof candidate.code === 'string') {
    return { code: candidate.code, message: candidate.message };
  }
  return undefined;
}
