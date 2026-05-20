let bookingPagePromise: Promise<typeof import('../views/BookingPage')> | undefined;
let pricingPagePromise: Promise<typeof import('../views/PricingPage')> | undefined;
let legalPagePromise: Promise<typeof import('../views/LegalPage')> | undefined;
let authPagePromise: Promise<typeof import('../views/AuthPage')> | undefined;
let passwordResetPagePromise: Promise<typeof import('../views/PasswordResetPage')> | undefined;
let detailsStepPromise: Promise<typeof import('../views/create/DetailsStep')> | undefined;
let availabilityStepPromise: Promise<typeof import('../views/create/AvailabilityStep')> | undefined;
let reviewStepPromise: Promise<typeof import('../views/create/ReviewStep')> | undefined;
let doneStepPromise: Promise<typeof import('../views/create/DoneStep')> | undefined;
let manageBookingPagePromise: Promise<typeof import('../views/ManageBookingPage')> | undefined;
let adminDashboardPagePromise: Promise<typeof import('../views/AdminDashboardPage')> | undefined;
let recoverAdminPagePromise: Promise<typeof import('../views/RecoverAdminPage')> | undefined;
let accountEventsPagePromise: Promise<typeof import('../views/AccountEventsPage')> | undefined;
let myBoardsPagePromise: Promise<typeof import('../views/MyBoardsPage')> | undefined;
let requestBoardsLinkPagePromise: Promise<typeof import('../views/RequestBoardsLinkPage')> | undefined;

let createRouteStylesPromise: Promise<unknown> | undefined;
let manageBookingStylesPromise: Promise<unknown> | undefined;
let managementStylesPromise: Promise<unknown> | undefined;
let accountStylesPromise: Promise<unknown> | undefined;
let checkoutReturnStylesPromise: Promise<unknown> | undefined;
let myBoardsStylesPromise: Promise<unknown> | undefined;
let pricingStylesPromise: Promise<unknown> | undefined;
let legalStylesPromise: Promise<unknown> | undefined;
let formStylesPromise: Promise<unknown> | undefined;

export function preloadBookingPage() {
  bookingPagePromise ??= Promise.all([
    preloadFormStyles(),
    import('../views/BookingPage'),
  ]).then(([, module]) => module);
  return bookingPagePromise;
}

export function preloadFormStyles() {
  formStylesPromise ??= import('../styles/form.css');
  return formStylesPromise;
}

export function preloadPricingPage() {
  pricingStylesPromise ??= import('../styles/pricing.css');
  pricingPagePromise ??= Promise.all([
    pricingStylesPromise,
    import('../views/PricingPage'),
  ]).then(([, module]) => module);
  return pricingPagePromise;
}

export function preloadLegalPage() {
  legalStylesPromise ??= import('../styles/legal.css');
  legalPagePromise ??= Promise.all([
    legalStylesPromise,
    import('../views/LegalPage'),
  ]).then(([, module]) => module);
  return legalPagePromise;
}

export function preloadAccountRouteStyles() {
  accountStylesPromise ??= Promise.all([
    preloadFormStyles(),
    import('../styles/account.css'),
  ]);
  return accountStylesPromise;
}

export function preloadCreateRouteStyles() {
  createRouteStylesPromise ??= Promise.all([
    preloadFormStyles(),
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
  authPagePromise ??= Promise.all([
    preloadAccountRouteStyles(),
    import('../views/AuthPage'),
  ]).then(([, module]) => module);
  return authPagePromise;
}

export function preloadPasswordResetPage() {
  passwordResetPagePromise ??= Promise.all([
    preloadAccountRouteStyles(),
    import('../views/PasswordResetPage'),
  ]).then(([, module]) => module);
  return passwordResetPagePromise;
}

export function preloadRecoverAdminPage() {
  recoverAdminPagePromise ??= Promise.all([
    preloadAccountRouteStyles(),
    import('../views/RecoverAdminPage'),
  ]).then(([, module]) => module);
  return recoverAdminPagePromise;
}

export function preloadManageBookingPage() {
  manageBookingStylesPromise ??= import('../styles/manage-booking.css');
  manageBookingPagePromise ??= Promise.all([
    preloadFormStyles(),
    manageBookingStylesPromise,
    import('../views/ManageBookingPage'),
  ]).then(([, , module]) => module);
  return manageBookingPagePromise;
}

export function preloadAdminDashboardPage() {
  managementStylesPromise ??= Promise.all([
    preloadFormStyles(),
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
  checkoutReturnStylesPromise ??= import('../styles/checkout-return.css');
  accountEventsPagePromise ??= Promise.all([
    preloadAccountRouteStyles(),
    checkoutReturnStylesPromise,
    import('../views/AccountEventsPage'),
  ]).then(([, , module]) => module);
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
    preloadAccountRouteStyles(),
    myBoardsStylesPromise,
    import('../views/RequestBoardsLinkPage'),
  ]).then(([, , module]) => module);
  return requestBoardsLinkPagePromise;
}
