let bookingPagePromise: Promise<unknown> | undefined;
let createFlowPromise: Promise<unknown> | undefined;
let authPagePromise: Promise<unknown> | undefined;
let accountAreaPromise: Promise<unknown> | undefined;

export function prefetchBookingPage() {
  bookingPagePromise ??= import('../views/BookingPage');
  return bookingPagePromise;
}

export function prefetchCreateFlow() {
  createFlowPromise ??= Promise.all([
    import('../views/create/DetailsStep'),
    import('../views/create/AvailabilityStep'),
    import('../views/create/ReviewStep'),
    import('../views/create/DoneStep'),
  ]);
  return createFlowPromise;
}

export function prefetchAuthPage() {
  authPagePromise ??= import('../views/AuthPage');
  return authPagePromise;
}

export function prefetchAccountArea() {
  accountAreaPromise ??= Promise.all([
    import('../views/AccountEventsPage'),
    import('../views/MyBoardsPage'),
    import('../views/RequestBoardsLinkPage'),
  ]);
  return accountAreaPromise;
}
