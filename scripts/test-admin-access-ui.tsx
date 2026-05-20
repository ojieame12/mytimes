import { JSDOM } from "jsdom";
import type { Root } from "react-dom/client";

const checked: string[] = [];

setupDom();

const React = await import("react");
Object.defineProperty(globalThis, "React", { value: React, configurable: true });
const { createRoot } = await import("react-dom/client");
const { Simulate } = await import("react-dom/test-utils");
const { AccountAdminAccessPanel, AdminAccessPanel } = await import("../apps/slots/src/components/AdminAccessPanel");
const { RotateAdminLinkModal } = await import("../apps/slots/src/components/RotateAdminLinkModal");
const { AdminLinkRotatedView } = await import("../apps/slots/src/components/AdminLinkRotatedView");

const container = document.getElementById("root");
if (!container) throw new Error("Missing test root");

const root = createRoot(container);

await testAdminAccessPanel(root);
await testAccountAdminAccessPanel(root);
await testRotateModalRequiresAcknowledgement(root);
await testRotatedReceiptLabelsResendHonestly(root);

await React.act(async () => {
  root.unmount();
});

console.log(JSON.stringify({ ok: true, checked }, null, 2));

async function testAdminAccessPanel(rootInstance: Root) {
  let rotateRequested = 0;
  await React.act(async () => {
    rootInstance.render(
      React.createElement(AdminAccessPanel, {
        organizerEmail: "organizer@example.com",
        currentUrlDisplay: "mytimes.co/a/...1234",
        onRotateAdminUrl: () => {
          rotateRequested += 1;
        },
      }),
    );
  });

  assert(text().includes("Admin access"), "admin access panel renders");
  assert(text().includes("Controls this board"), "admin panel labels the private credential");
  assert(text().includes("mytimes.co/a/...1234"), "admin panel shows the truncated admin URL");
  assert(
    text().includes("Recovery and rotation both send a different admin URL"),
    "admin panel explains recovery rotates the credential",
  );

  await click(buttonContaining("Send new admin URL"));
  assert(rotateRequested === 1, "admin panel requests admin URL rotation");
}

async function testAccountAdminAccessPanel(rootInstance: Root) {
  let rotateRequested = 0;
  await React.act(async () => {
    rootInstance.render(
      React.createElement(AccountAdminAccessPanel, {
        organizerEmail: "organizer@example.com",
        onRotatePrivateUrl: () => {
          rotateRequested += 1;
        },
      }),
    );
  });

  assert(text().includes("Account mode"), "account access panel labels account-mode protection");
  assert(
    text().includes("private admin URL can still exist for no-account access"),
    "account access panel explains legacy private URL access",
  );
  assert(
    text().includes("this account dashboard stays open"),
    "account access panel explains account session is not invalidated",
  );

  await click(buttonContaining("Send replacement URL"));
  assert(rotateRequested === 1, "account access panel requests private URL replacement");
}

async function testRotateModalRequiresAcknowledgement(rootInstance: Root) {
  let rotated = 0;
  let rotateCalls = 0;
  await React.act(async () => {
    rootInstance.render(
      React.createElement(RotateAdminLinkModal, {
        eventTitle: "Design Interview",
        organizerEmail: "organizer@example.com",
        currentUrlDisplay: "mytimes.co/a/...1234",
        onCancel: () => undefined,
        onRotated: () => {
          rotated += 1;
        },
        rotate: async () => {
          rotateCalls += 1;
        },
      }),
    );
  });

  const send = buttonContaining("Send new URL") as HTMLButtonElement;
  assert(send.disabled, "rotate modal disables send until acknowledged");
  assert(
    text().includes("Participants and the public booking link are not affected"),
    "rotate modal separates admin URL rotation from public booking link rotation",
  );

  const checkbox = document.querySelector(".rotate-modal__ack input");
  if (!(checkbox instanceof HTMLInputElement)) {
    throw new Error("Missing acknowledgement checkbox");
  }

  await React.act(async () => {
    checkbox.checked = true;
    Simulate.change(checkbox);
  });
  assert(!send.disabled, "rotate modal enables send after acknowledgement");

  await click(send);
  assert(rotateCalls === 1 && rotated === 1, "rotate modal calls rotate and then reports success");
}

async function testRotatedReceiptLabelsResendHonestly(rootInstance: Root) {
  let resendCalls = 0;
  await React.act(async () => {
    rootInstance.render(
      React.createElement(AdminLinkRotatedView, {
        eventTitle: "Design Interview",
        organizerEmail: "organizer@example.com",
        onResend: async () => {
          resendCalls += 1;
        },
      }),
    );
  });

  assert(text().includes("Rotate and send again"), "receipt labels repeat action as another rotation");
  assert(text().includes("only the latest email will work"), "receipt explains latest-email behavior");

  await click(buttonContaining("Rotate and send again"));
  assert(resendCalls === 1, "receipt resend rotates again through callback");
  assert(text().includes("Newer URL sent"), "receipt confirms a newer URL, not another copy");
}

async function click(element: Element) {
  await React.act(async () => {
    Simulate.click(element);
  });
  await flushEffects();
}

async function flushEffects() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function buttonContaining(label: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`Missing button containing "${label}"`);
  }
  return match;
}

function text(): string {
  return document.body.textContent ?? "";
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
  checked.push(label);
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: "https://mytimes.co/a/admin_test_token",
  });

  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  Object.defineProperty(globalThis, "HTMLElement", { value: dom.window.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, "HTMLButtonElement", {
    value: dom.window.HTMLButtonElement,
    configurable: true,
  });
  Object.defineProperty(globalThis, "HTMLInputElement", {
    value: dom.window.HTMLInputElement,
    configurable: true,
  });
  Object.defineProperty(dom.window.navigator, "clipboard", {
    value: { writeText: async () => undefined },
    configurable: true,
  });
}
