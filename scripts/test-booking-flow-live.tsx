import { JSDOM } from "jsdom";
import pg from "pg";
import type { Root } from "react-dom/client";
import type { ClaimSlotResponse, PublicBoardResponse } from "../apps/slots/src/lib/api";

const { Pool } = pg;
const databaseURL =
  process.env.SLOTBOARD_DATABASE_URL ||
  "postgres://slotboard:slotboard@localhost:5434/slotboard?sslmode=disable";
const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const actor = `booking-live-flow-${suffix}`;
const checked: string[] = [];
let baseURL = "";

process.env.SLOTBOARD_DATABASE_URL ||= databaseURL;
process.env.SLOTBOARD_EMAIL_WEBHOOK_SECRET ||= "local-email-webhook-secret";
process.env.SLOTBOARD_TOKEN_PEPPER ||= "dev-token-pepper-replace-before-production";
process.env.SLOTBOARD_AUTH_SECRET ||= "dev-better-auth-secret-replace-before-production";

const pool = new Pool({ connectionString: databaseURL, application_name: "slotboard-booking-live-flow-test" });
const closeApi = await startSourceApi();

try {
  const board = await createDisposableBoard();
  const publicToken = tokenFromLink(board.links.public);
  const publicBefore = await apiJson("/api/slotboard/book", { token: publicToken });
  assert(publicBefore.event.avatarStyle === "open-peeps", "public board preserves avatar style");
  assert(publicBefore.event.avatarSeed === board.event.avatarSeed, "public board preserves avatar seed");
  assert(publicBefore.slots.length === 8, `public board exposes generated slots, got ${publicBefore.slots.length}`);
  assert(
    publicBefore.slots.every((slot: { sourceDate?: string }) => slot.sourceDate?.startsWith("2026-06-")),
    "public board keeps source dates as date-only values",
  );
  assertNoPublicLeak(publicBefore, [publicToken, tokenFromLink(board.links.admin)]);

  const dom = setupDom(`/b/${publicToken}`);
  const React = await import("react");
  Object.defineProperty(globalThis, "React", { value: React, configurable: true });
  const { createRoot } = await import("react-dom/client");
  const { Simulate } = await import("react-dom/test-utils");
  const { BookingPage } = await import("../apps/slots/src/views/BookingPage");

  const container = must(document.getElementById("root"), "expected DOM root");
  const root: Root = createRoot(container);
  function Harness() {
    const [boardState, setBoardState] = React.useState<PublicBoardResponse>(publicBefore);
    return React.createElement(BookingPage, {
      publicToken,
      event: boardState.event,
      slots: boardState.slots,
      onClaimed: (response: ClaimSlotResponse) => {
        setBoardState((current) => ({
          ...current,
          slots: current.slots.filter((slot) => slot.id !== response.slot.id),
        }));
      },
    });
  }
  await React.act(async () => {
    root.render(React.createElement(Harness));
  });
  await waitForText("Flow Trace Board", "booking board loads into app route");

  const initialChipCount = document.querySelectorAll(".day-band__chip").length;
  assert(initialChipCount === 8, `app renders eight selectable slot chips, got ${initialChipCount}`);

  await click(document.querySelectorAll<HTMLButtonElement>(".day-band__chip")[0]);
  await setField("participantName", "Zoë 山田 Candidate ✅", Simulate);
  await setField("participantEmail", `participant+${suffix}@example.com`, Simulate);
  await click(buttonContaining("Add a note"));
  await setField("notes", "Needs RTL check: مرحبا. Also confirms emoji persistence ✅.", Simulate);
  await submitInlineForm();
  await waitForText("You're booked", "claim success stays mounted in the selected day band");
  assert(document.body.textContent?.includes("MANAGE LINK"), "success state includes private manage link card");

  await click(buttonContaining("Reveal"));
  const manageURL = must(
    document.querySelector<HTMLElement>(".link-card__url")?.textContent?.trim(),
    "expected revealed manage URL",
  );
  const manageToken = tokenFromLink(manageURL);

  const publicAfterClaim = await apiJson("/api/slotboard/book", { token: publicToken });
  assert(publicAfterClaim.slots.length === 7, `server hides claimed slot immediately, got ${publicAfterClaim.slots.length}`);
  assert(!JSON.stringify(publicAfterClaim).includes(`participant+${suffix}@example.com`), "public board does not leak participant email after claim");

  const booking = await readLatestBooking(board.event.id);
  assert(booking.participant_name === "Zoë 山田 Candidate ✅", "database persists participant name exactly");
  assert(booking.participant_email === `participant+${suffix}@example.com`, "database persists participant email");
  assert(booking.notes === "Needs RTL check: مرحبا. Also confirms emoji persistence ✅.", "database persists unicode notes exactly");
  assert(booking.participant_timezone === "Africa/Johannesburg", "database stores viewer timezone from booking form");
  assert(Boolean(booking.participant_offset_at_booking), "database stores participant offset at booking");

  await click(buttonContaining("Done"));
  await waitFor(() => document.querySelectorAll(".day-band__chip").length === 7, "app removes claimed slot after Done");

  await apiJson("/api/slotboard/manage/cancel", {
    method: "POST",
    token: manageToken,
    body: { reason: "Live flow trace cancellation." },
  });
  const publicAfterCancel = await apiJson("/api/slotboard/book", { token: publicToken });
  assert(publicAfterCancel.slots.length === 8, `server reopens cancelled participant slot, got ${publicAfterCancel.slots.length}`);

  await React.act(async () => {
    root.unmount();
  });
  dom.window.close();

  console.log(JSON.stringify({ ok: true, baseURL, checked }, null, 2));
} finally {
  await closeApi();
  await pool.end();
  const { closePool } = await import("../apps/slots-api/src/db");
  await closePool();
}

async function startSourceApi() {
  const { serve } = await import("@hono/node-server");
  const { app } = await import("../apps/slots-api/src/app");

  let server: { close(callback: (error?: Error) => void): void } | undefined;
  await new Promise<void>((resolve) => {
    server = serve(
      {
        fetch: app.fetch,
        hostname: "127.0.0.1",
        port: 0,
      },
      (info) => {
        baseURL = `http://127.0.0.1:${info.port}`;
        process.env.SLOTBOARD_PUBLIC_APP_URL = baseURL;
        process.env.SLOTBOARD_WEB_ORIGINS = baseURL;
        resolve();
      },
    );
  });

  return () =>
    new Promise<void>((resolve, reject) => {
      server?.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
}

async function createDisposableBoard() {
  return apiJson("/api/slotboard/events", {
    method: "POST",
    idempotencyKey: `trace-board-${suffix}`,
    body: {
      title: `Flow Trace Board ${suffix}`,
      description: "Disposable end-to-end booking trace.",
      organizerName: "Trace Organizer",
      organizerEmail: `trace-organizer+${suffix}@example.com`,
      avatarStyle: "open-peeps",
      timezone: "Africa/Johannesburg",
      allowMultipleBookings: false,
      availability: {
        startDate: "2026-06-08",
        endDate: "2026-06-09",
        weekdays: [1, 2],
        dailyStart: "09:00",
        dailyEnd: "11:00",
        durationMinutes: 30,
        timezone: "Africa/Johannesburg",
        blockedRanges: [],
      },
    },
  });
}

function setupDom(path: string) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `${baseURL}${path}`,
    pretendToBeVisual: true,
  });
  const win = dom.window;
  Object.defineProperty(globalThis, "window", { value: win, configurable: true });
  Object.defineProperty(globalThis, "document", { value: win.document, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
  Object.defineProperty(win.navigator, "language", { value: "en-ZA", configurable: true });
  Object.defineProperty(globalThis, "HTMLElement", { value: win.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, "HTMLInputElement", { value: win.HTMLInputElement, configurable: true });
  Object.defineProperty(globalThis, "HTMLTextAreaElement", { value: win.HTMLTextAreaElement, configurable: true });
  Object.defineProperty(globalThis, "Event", { value: win.Event, configurable: true });
  Object.defineProperty(globalThis, "InputEvent", { value: win.InputEvent, configurable: true });
  Object.defineProperty(globalThis, "MouseEvent", { value: win.MouseEvent, configurable: true });
  Object.defineProperty(globalThis, "KeyboardEvent", { value: win.KeyboardEvent, configurable: true });
  Object.defineProperty(globalThis, "PointerEvent", { value: win.PointerEvent ?? win.MouseEvent, configurable: true });
  Object.defineProperty(win, "__SLOTBOARD_API_URL__", { value: baseURL, configurable: true });
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => `33333333-3333-4333-8333-${Math.random().toString().slice(2, 14).padEnd(12, "3")}` },
    configurable: true,
  });
  const IntersectionObserverMock = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(globalThis, "IntersectionObserver", { value: IntersectionObserverMock, configurable: true });
  Object.defineProperty(win, "IntersectionObserver", { value: IntersectionObserverMock, configurable: true });
  win.HTMLElement.prototype.scrollIntoView = () => {};
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function apiJson(path: string, options: {
  method?: "GET" | "POST";
  token?: string;
  idempotencyKey?: string;
  body?: unknown;
} = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method ?? "GET",
    headers: requestHeaders(options),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text}`);
  }
  return body;
}

function requestHeaders(options: { token?: string; idempotencyKey?: string; body?: unknown }) {
  const headers: Record<string, string> = {
    "x-forwarded-for": actor,
    "x-slotboard-smoke-actor": actor,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  return headers;
}

async function readLatestBooking(eventId: string) {
  const result = await pool.query(
    `
      select participant_name,
             participant_email,
             participant_timezone,
             participant_locale,
             participant_offset_at_booking,
             notes
      from slotboard.bookings
      where event_id = $1
      order by booked_at desc
      limit 1
    `,
    [eventId],
  );
  return must(result.rows[0], "expected booking row");
}

async function click(element: Element | null | undefined) {
  const target = must(element, "expected clickable element");
  const React = await import("react");
  await React.act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flushEffects();
}

async function setField(
  name: string,
  value: string,
  Simulate: { change(element: Element): void },
) {
  const field = must(
    document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`),
    `expected ${name} field`,
  );
  const prototype =
    field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  const React = await import("react");
  await React.act(async () => {
    setter?.call(field, value);
    Simulate.change(field);
  });
  await flushEffects();
}

async function submitInlineForm() {
  const form = must(document.querySelector<HTMLFormElement>(".inline-slot-form__form"), "expected inline form");
  const React = await import("react");
  await React.act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  await flushEffects();
}

async function waitForText(text: string, label: string) {
  await waitFor(() => document.body.textContent?.includes(text) === true, label);
}

async function waitFor(condition: () => boolean, label: string) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (condition()) {
      assert(true, label);
      return;
    }
    await flushEffects();
  }
  throw new Error(`Booking live flow failed: ${label}`);
}

async function flushEffects() {
  const React = await import("react");
  await React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonContaining(text: string) {
  return must(
    [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes(text),
    ),
    `expected button containing ${text}`,
  );
}

function tokenFromLink(link: string) {
  const token = new URL(link).pathname.split("/").filter(Boolean).at(-1);
  return must(token, `expected token in ${link}`);
}

function assertNoPublicLeak(value: unknown, rawTokens: string[]) {
  const text = JSON.stringify(value);
  for (const token of rawTokens) {
    assert(!text.includes(token), "public board does not leak raw tokens");
  }
  assert(!text.includes("participantEmail"), "public board does not expose participant email fields");
}

function must<T>(value: T | null | undefined, message: string): T {
  assert(Boolean(value), message);
  return value as T;
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) {
    throw new Error(`Booking live flow failed: ${label}`);
  }
  checked.push(label);
}
