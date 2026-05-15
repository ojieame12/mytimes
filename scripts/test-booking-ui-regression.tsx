import { JSDOM } from "jsdom";
import type { Root } from "react-dom/client";
import type { ClaimSlotResponse, ManageBookingResponse } from "../apps/slots/src/lib/api";
import type { BookingEvent, TimeSlot } from "../apps/slots/src/lib/types";

const checked: string[] = [];

setupDom();

const React = await import("react");
Object.defineProperty(globalThis, "React", { value: React, configurable: true });
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const { Simulate } = await import("react-dom/test-utils");
const { BookingPage } = await import("../apps/slots/src/views/BookingPage");
const { ManageBookingPage } = await import("../apps/slots/src/views/ManageBookingPage");

const container = document.getElementById("root");
if (!container) throw new Error("Missing test root");

const root = createRoot(container);

const event: BookingEvent = {
  id: "evt_booking_ui_regression",
  title: "Design Interview",
  description: "Pick a time that works for you.",
  organizerName: "Mark Reynolds",
  organizerEmail: "mark@example.com",
  timezone: "UTC",
  durationMinutes: 30,
  allowMultipleBookings: false,
  status: "active",
  paymentStatus: "not_required",
  createdAt: "2026-05-14T12:00:00.000Z",
};

const slotOne = makeSlot("00000000-0000-4000-8000-000000000001", "2026-06-01T09:00:00.000Z");
const slotTwo = makeSlot("00000000-0000-4000-8000-000000000002", "2026-06-02T14:00:00.000Z");
const slots = [slotOne, slotTwo];

await renderBoard(root, { publicToken: "board-a", slots });
const firstChip = chipAt(0);
const secondChip = chipAt(1);
await click(firstChip);

await setField("participantName", "Ava Candidate");
await setField("participantEmail", "ava@example.com");
await click(buttonContaining("Add a note"));
await setField("notes", "Needs five minutes at the start for setup.");

assert(
  inputValue("participantName") === "Ava Candidate" &&
    inputValue("participantEmail") === "ava@example.com" &&
    inputValue("notes") === "Needs five minutes at the start for setup.",
  "booking form collects name, email, and optional notes",
);

await click(secondChip);
assert(
  inputValue("participantName") === "Ava Candidate" &&
    inputValue("participantEmail") === "ava@example.com" &&
    inputValue("notes") === "Needs five minutes at the start for setup.",
  "booking draft survives switching to another slot",
);

await renderBoard(root, { publicToken: "board-b", slots });
assert(!queryField("participantName"), "public token change clears selected slot");

await click(chipAt(0));
assert(
  inputValue("participantName") === "" &&
    inputValue("participantEmail") === "" &&
    !queryField("notes"),
  "public token change clears saved booking draft",
);

await renderBoard(root, { publicToken: "board-b", slots: [slotTwo] });
assert(!queryField("participantName"), "selected form closes when selected slot disappears");

await renderBoard(root, { publicToken: "board-b", slots });
assert(!queryField("participantName"), "stale selected slot does not re-open after slots return");

await testClaimSubmitGuard(root);
await testConflictKeepsDraft(root);
await testManagePageReschedulesWithManageToken(root);
testUnavailableBoardCopy();

await React.act(async () => {
  root.unmount();
});

console.log(JSON.stringify({ ok: true, checked }, null, 2));

async function renderBoard(
  rootInstance: Root,
  props: {
    publicToken: string;
    slots: TimeSlot[];
    demoMode?: boolean;
    onClaimed?: (response: ClaimSlotResponse) => void;
    onConflict?: () => void;
  },
) {
  await React.act(async () => {
    rootInstance.render(
      React.createElement(BookingPage, {
        publicToken: props.publicToken,
        event,
        slots: props.slots,
        demoMode: props.demoMode ?? true,
        onClaimed: props.onClaimed,
        onConflict: props.onConflict,
      }),
    );
  });
  await flushEffects();
}

async function testClaimSubmitGuard(rootInstance: Root) {
  const pending = deferred<Response>();
  const calls = installFetchMock((url) => {
    if (url.pathname !== "/api/slotboard/book/claim") {
      throw new Error(`Unexpected fetch in claim guard test: ${url.pathname}`);
    }
    return pending.promise;
  });

  let claimed: ClaimSlotResponse | undefined;
  await renderBoard(rootInstance, {
    publicToken: "claim-guard-board",
    slots,
    demoMode: false,
    onClaimed: (response) => {
      claimed = response;
    },
  });
  await click(chipAt(0));
  await setField("participantName", "Ava Candidate");
  await setField("participantEmail", "ava@example.com");

  const form = bookingForm();
  await React.act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  assert(calls.length === 1, "claim submit guard suppresses duplicate same-tick posts");
  assert(
    calls[0]?.method === "POST" && Boolean(calls[0]?.headers["idempotency-key"]),
    "claim request is posted with idempotency key",
  );
  assert(
    JSON.parse(calls[0]?.body ?? "{}").slotId === slotOne.id,
    "claim request posts the selected slot",
  );

  const response = makeClaimResponse(slotOne);
  await React.act(async () => {
    pending.resolve(jsonResponse(response));
    await pending.promise;
  });
  await flushEffects();

  assert(document.body.textContent?.includes("You're booked"), "claim success stays mounted");
  assert(!claimed, "claim success does not notify parent before Done");
  await click(buttonContaining("Done"));
  assert(claimed?.booking.id === response.booking.id, "claim success finalizes on Done");
  assert(!document.body.textContent?.includes("You're booked"), "claim success closes after Done");
}

async function testConflictKeepsDraft(rootInstance: Root) {
  const calls = installFetchMock((url) => {
    if (url.pathname !== "/api/slotboard/book/claim") {
      throw new Error(`Unexpected fetch in conflict test: ${url.pathname}`);
    }
    return jsonResponse(
      { error: "slot_taken", message: "That slot was just booked." },
      { status: 409 },
    );
  });

  let conflictCount = 0;
  await renderBoard(rootInstance, {
    publicToken: "conflict-board",
    slots,
    demoMode: false,
    onConflict: () => {
      conflictCount += 1;
    },
  });
  await click(chipAt(0));
  await setField("participantName", "Ava Candidate");
  await setField("participantEmail", "ava@example.com");
  await click(buttonContaining("Add a note"));
  await setField("notes", "Keep this note after conflict.");
  await submitBookingForm();

  assert(calls.length === 1, "slot conflict submits exactly one claim request");
  assert(
    document.body.textContent?.includes("That slot was just booked."),
    "slot conflict renders recovery state",
  );
  await click(buttonContaining("Choose another time"));
  assert(conflictCount === 1, "slot conflict acknowledgement notifies parent");
  await click(chipAt(1));
  assert(
    inputValue("participantName") === "Ava Candidate" &&
      inputValue("participantEmail") === "ava@example.com" &&
      inputValue("notes") === "Keep this note after conflict.",
    "slot conflict keeps participant draft for another slot",
  );
}

async function testManagePageReschedulesWithManageToken(rootInstance: Root) {
  const manageResponse: ManageBookingResponse = {
    event,
    slot: slotOne,
    booking: makeClaimResponse(slotOne).booking,
  };
  const calls = installFetchMock((url, init) => {
    if (url.pathname === "/api/slotboard/manage") {
      return jsonResponse(manageResponse);
    }
    if (url.pathname === "/api/slotboard/manage/reschedule" && init?.method !== "POST") {
      return jsonResponse({
        ...manageResponse,
        slots: [slotTwo],
      });
    }
    if (url.pathname === "/api/slotboard/manage/reschedule" && init?.method === "POST") {
      return jsonResponse({
        ...manageResponse,
        slot: {
          ...slotTwo,
          state: "booked",
          bookingId: manageResponse.booking.id,
        },
        booking: {
          ...manageResponse.booking,
          slotId: slotTwo.id,
          icsSequence: manageResponse.booking.icsSequence + 1,
        },
      });
    }
    throw new Error(`Unexpected fetch in manage page test: ${url.pathname}`);
  });

  await React.act(async () => {
    rootInstance.render(React.createElement(ManageBookingPage, { manageToken: "manage-token" }));
  });
  await flushEffects();

  assert(calls[0]?.headers.authorization === "Bearer manage-token", "manage page reads with manage token");
  assert(document.body.textContent?.includes("Cancel booking"), "manage page renders cancellation action");
  assert(
    !document.body.textContent?.includes("Reschedule"),
    "manage page avoids invalid event-id reschedule route",
  );
  await click(buttonContaining("Change time"));
  assert(calls[1]?.headers.authorization === "Bearer manage-token", "manage reschedule options use manage token");
  assert(document.body.textContent?.includes("Move booking"), "manage page renders replacement slot action");
  const moveButton = buttonContaining("Move booking");
  await React.act(async () => {
    moveButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    moveButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flushEffects();
  assert(calls[2]?.method === "POST", "manage reschedule posts selected replacement slot");
  assert(
    calls.filter((call) => call.url.endsWith("/api/slotboard/manage/reschedule") && call.method === "POST").length === 1,
    "manage reschedule suppresses duplicate same-tick posts",
  );
  assert(calls[2]?.headers.authorization === "Bearer manage-token", "manage reschedule submit uses manage token");
  assert(Boolean(calls[2]?.headers["idempotency-key"]), "manage reschedule sends idempotency key");
  assert(JSON.parse(calls[2]?.body ?? "{}").slotId === slotTwo.id, "manage reschedule posts replacement slot id");
  assert(document.body.textContent?.includes("Booking moved"), "manage page confirms reschedule");
}

function testUnavailableBoardCopy() {
  const expiredHtml = renderBoardHtml({
    publicToken: "expired-board",
    event: {
      ...event,
      id: "evt_expired_booking_ui_regression",
      expiresAt: "2026-01-01T00:00:00.000Z",
    },
    slots: [],
  });
  assert(
    expiredHtml.includes("This booking board has expired."),
    "expired board explains expiration instead of full booking",
  );
  assert(
    !expiredHtml.includes("All slots are currently booked"),
    "expired board does not render fully booked copy",
  );

  const pendingHtml = renderBoardHtml({
    publicToken: "payment-pending-board",
    event: {
      ...event,
      id: "evt_payment_pending_booking_ui_regression",
      paymentStatus: "pending",
    },
    slots: [slotOne],
  });
  assert(
    pendingHtml.includes("This booking board is not accepting bookings yet."),
    "pending-payment board explains activation state",
  );
  assert(
    !pendingHtml.includes("day-band__chip"),
    "pending-payment board hides selectable slots",
  );

  const fullHtml = renderBoardHtml({
    publicToken: "fully-booked-board",
    event: {
      ...event,
      id: "evt_fully_booked_booking_ui_regression",
      paymentStatus: "not_required",
      expiresAt: undefined,
    },
    slots: [],
  });
  assert(
    fullHtml.includes("All slots are currently booked"),
    "empty active board renders fully booked copy",
  );
}

function renderBoardHtml(props: {
  publicToken: string;
  event: BookingEvent;
  slots: TimeSlot[];
}) {
  return renderToStaticMarkup(
    React.createElement(BookingPage, {
      publicToken: props.publicToken,
      event: props.event,
      slots: props.slots,
    }),
  );
}

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "https://mytimes.co/b/board-a",
  });
  const win = dom.window;
  Object.defineProperty(globalThis, "window", { value: win, configurable: true });
  Object.defineProperty(globalThis, "document", { value: win.document, configurable: true });
  Object.defineProperty(win.navigator, "language", { value: "en-GB", configurable: true });
  Object.defineProperty(win.navigator, "userAgent", {
    value: "Mozilla/5.0 Booking UI Regression",
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
  Object.defineProperty(globalThis, "Node", { value: win.Node, configurable: true });
  Object.defineProperty(globalThis, "Element", { value: win.Element, configurable: true });
  Object.defineProperty(globalThis, "EventTarget", { value: win.EventTarget, configurable: true });
  Object.defineProperty(globalThis, "HTMLElement", { value: win.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, "HTMLInputElement", {
    value: win.HTMLInputElement,
    configurable: true,
  });
  Object.defineProperty(globalThis, "HTMLTextAreaElement", {
    value: win.HTMLTextAreaElement,
    configurable: true,
  });
  Object.defineProperty(globalThis, "Event", { value: win.Event, configurable: true });
  Object.defineProperty(globalThis, "InputEvent", { value: win.InputEvent, configurable: true });
  Object.defineProperty(globalThis, "MouseEvent", { value: win.MouseEvent, configurable: true });
  Object.defineProperty(globalThis, "KeyboardEvent", {
    value: win.KeyboardEvent,
    configurable: true,
  });
  Object.defineProperty(globalThis, "PointerEvent", {
    value: win.PointerEvent ?? win.MouseEvent,
    configurable: true,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    configurable: true,
  });
  Object.defineProperty(win, "IntersectionObserver", {
    value: globalThis.IntersectionObserver,
    configurable: true,
  });
  win.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
}

function makeSlot(id: string, startsAt: string): TimeSlot {
  const start = new Date(startsAt);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 30);
  return {
    id,
    eventId: event.id,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    state: "open",
  };
}

function chipAt(index: number): HTMLButtonElement {
  const chip = document.querySelectorAll<HTMLButtonElement>(".day-band__chip")[index];
  if (!chip) throw new Error(`Missing slot chip ${index}`);
  return chip;
}

function buttonContaining(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`Missing button containing "${text}"`);
  return button;
}

async function click(element: HTMLElement) {
  await React.act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flushEffects();
}

async function submitBookingForm() {
  const form = bookingForm();
  await React.act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flushEffects();
}

function bookingForm(): HTMLFormElement {
  const form = document.querySelector<HTMLFormElement>(".inline-slot-form__form");
  if (!form) throw new Error("Missing booking form");
  return form;
}

async function setField(name: string, value: string) {
  const field = queryField(name);
  if (!field) throw new Error(`Missing field ${name}`);
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await React.act(async () => {
    setter?.call(field, value);
    Simulate.input(field, { target: { value } });
    Simulate.change(field, { target: { value } });
  });
  await flushEffects();
}

function inputValue(name: string): string {
  const field = queryField(name);
  if (!field) throw new Error(`Missing field ${name}`);
  return field.value;
}

function queryField(name: string): HTMLInputElement | HTMLTextAreaElement | null {
  return document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
}

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

function installFetchMock(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  Object.defineProperty(globalThis, "fetch", {
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawURL =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const url = new URL(rawURL);
      calls.push({
        url: url.href,
        method: init?.method ?? "GET",
        headers: headersToRecord(init?.headers),
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return handler(url, init);
    },
    configurable: true,
  });
  return calls;
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  if (!headers) return record;
  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(value), { ...init, headers });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve_, reject_) => {
    resolve = resolve_;
    reject = reject_;
  });
  return { promise, resolve, reject };
}

function makeClaimResponse(slot: TimeSlot): ClaimSlotResponse {
  return {
    event,
    slot: {
      ...slot,
      state: "booked",
    },
    booking: {
      id: "booking-ui-regression-booking",
      eventId: event.id,
      slotId: slot.id,
      participantName: "Ava Candidate",
      participantEmail: "ava@example.com",
      participantTimezone: "UTC",
      participantLocale: "en-GB",
      participantOffsetAtBooking: "+00:00",
      notes: "Keep this note after conflict.",
      status: "active",
      bookedAt: "2026-05-14T12:30:00.000Z",
      icsSequence: 0,
    },
    links: {
      manage: "https://mytimes.co/m/manage-token",
    },
  };
}

async function flushEffects() {
  for (let i = 0; i < 3; i += 1) {
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function assert(condition: unknown, label: string) {
  if (!condition) {
    throw new Error(`Booking UI regression failed: ${label}`);
  }
  checked.push(label);
}
