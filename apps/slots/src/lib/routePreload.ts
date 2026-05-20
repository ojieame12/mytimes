let bookingPagePromise: Promise<typeof import('../views/BookingPage')> | undefined;
let authPagePromise: Promise<typeof import('../views/AuthPage')> | undefined;
let passwordResetPagePromise: Promise<typeof import('../views/PasswordResetPage')> | undefined;
let detailsStepPromise: Promise<typeof import('../views/create/DetailsStep')> | undefined;
let availabilityStepPromise: Promise<typeof import('../views/create/AvailabilityStep')> | undefined;
let reviewStepPromise: Promise<typeof import('../views/create/ReviewStep')> | undefined;
let doneStepPromise: Promise<typeof import('../views/create/DoneStep')> | undefined;
let manageBookingPagePromise: Promise<typeof import('../views/ManageBookingPage')> | undefined;
let adminDashboardPagePromise: Promise<typeof import('../views/AdminDashboardPage')> | undefined;
let accountEventsPagePromise: Promise<typeof import('../views/AccountEventsPage')> | undefined;
let myBoardsPagePromise: Promise<typeof import('../views/MyBoardsPage')> | undefined;
let requestBoardsLinkPagePromise: Promise<typeof import('../views/RequestBoardsLinkPage')> | undefined;

let createRouteStylesPromise: Promise<unknown> | undefined;
let manageBookingStylesPromise: Promise<unknown> | undefined;
let managementStylesPromise: Promise<unknown> | undefined;
let accountStylesPromise: Promise<unknown> | undefined;
let myBoardsStylesPromise: Promise<unknown> | undefined;

export function preloadBookingPage() {
  bookingPagePromise ??= import('../views/BookingPage');
  return bookingPagePromise;
}

export function preloadCreateRouteStyles() {
  createRouteStylesPromise ??= Promise.all([
    import('../styles/create-flow.css'),
    import('../styles/paywall.css'),
  ]);
  return createRouteStylesPromise;
}

export function preloadDetailsStep() {
  detailsStepPromise ??= Promise.all([
    preloadCreateRouteStyles(),
    import('../views/create/DetailsStep'),
  ]).then(([, module]) => module);
  return detailsStepPromise;
}

export function preloadAvailabilityStep() {
  availabilityStepPromise ??= Promise.all([
    preloadCreateRouteStyles(),
    import('../views/create/AvailabilityStep'),
  ]).then(([, module]) => module);
  return availabilityStepPromise;
}

export function preloadReviewStep() {
  reviewStepPromise ??= Promise.all([
    preloadCreateRouteStyles(),
    import('../views/create/ReviewStep'),
  ]).then(([, module]) => module);
  return reviewStepPromise;
}

export function preloadDoneStep() {
  doneStepPromise ??= Promise.all([
    preloadCreateRouteStyles(),
    import('../views/create/DoneStep'),
  ]).then(([, module]) => module);
  return doneStepPromise;
}

export function preloadAuthPage() {
  authPagePromise ??= import('../views/AuthPage');
  return authPagePromise;
}

export function preloadPasswordResetPage() {
  passwordResetPagePromise ??= import('../views/PasswordResetPage');
  return passwordResetPagePromise;
}

export function preloadManageBookingPage() {
  manageBookingStylesPromise ??= import('../styles/manage-booking.css');
  manageBookingPagePromise ??= Promise.all([
    manageBookingStylesPromise,
    import('../views/ManageBookingPage'),
  ]).then(([, module]) => module);
  return manageBookingPagePromise;
}

export function preloadAdminDashboardPage() {
  managementStylesPromise ??= Promise.all([
    import('../styles/checkout-return.css'),
    import('../styles/management.css'),
  ]);
  adminDashboardPagePromise ??= Promise.all([
    managementStylesPromise,
    import('../views/AdminDashboardPage'),
  ]).then(([, module]) => module);
  return adminDashboardPagePromise;
}

export function preloadAccountEventsPage() {
  accountStylesPromise ??= import('../styles/checkout-return.css');
  accountEventsPagePromise ??= Promise.all([
    accountStylesPromise,
    import('../views/AccountEventsPage'),
  ]).then(([, module]) => module);
  return accountEventsPagePromise;
}

export function preloadMyBoardsPage() {
  myBoardsStylesPromise ??= import('../styles/my-boards.css');
  myBoardsPagePromise ??= Promise.all([
    myBoardsStylesPromise,
    import('../views/MyBoardsPage'),
  ]).then(([, module]) => module);
  return myBoardsPagePromise;
}

export function preloadRequestBoardsLinkPage() {
  myBoardsStylesPromise ??= import('../styles/my-boards.css');
  requestBoardsLinkPagePromise ??= Promise.all([
    myBoardsStylesPromise,
    import('../views/RequestBoardsLinkPage'),
  ]).then(([, module]) => module);
  return requestBoardsLinkPagePromise;
}
