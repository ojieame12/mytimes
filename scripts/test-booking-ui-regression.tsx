import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import type { Root } from "react-dom/client";
import type { BookingEvent, TimeSlot } from "../apps/slots/src/lib/types";

const checked: string[] = [];

setupDom();

const React = await import("react");
Object.defineProperty(globalThis, "React", { value: React, configurable: true });
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const { Simulate } = await import("react-dom/test-utils");
const { BookingPage } = await import("../apps/slots/src/views/BookingPage");

const container = document.getElementById("root");
if (!container) throw new Error("Missing test root");

const root = createRoot(container);

const event: BookingEvent = {
  id: "evt_booking_ui_regression",
  title: "Design Interview",
  description: "Pick a time that works for you.",
  organizerName: "Nathan Ojie",
  organizerEmail: "nathan@example.com",
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

testClaimSuccessPersistsUntilDone();
testUnavailableBoardCopy();

await React.act(async () => {
  root.unmount();
});

console.log(JSON.stringify({ ok: true, checked }, null, 2));

async function renderBoard(
  rootInstance: Root,
  props: { publicToken: string; slots: TimeSlot[] },
) {
  await React.act(async () => {
    rootInstance.render(
      React.createElement(BookingPage, {
        publicToken: props.publicToken,
        event,
        slots: props.slots,
        demoMode: true,
      }),
    );
  });
  await flushEffects();
}

function testClaimSuccessPersistsUntilDone() {
  const source = readFileSync(
    new URL("../apps/slots/src/components/InlineSlotForm.tsx", import.meta.url),
    "utf8",
  );
  assert(source.includes("claimSlot("), "claim form calls participant claim endpoint");
  assert(source.includes("{ idempotencyKey }"), "claim request sends idempotency key");
  assert(source.includes("setClaimed(response)"), "claim success stores local confirmation state");
  assert(
    source.includes("onDraftChange?.(EMPTY_INLINE_SLOT_FORM_DRAFT)"),
    "claim success clears saved participant draft",
  );
  assert(source.includes("finalizeClaim();") && source.includes("onDone={() =>"), "claim success finalizes on Done");
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
