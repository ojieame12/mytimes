import { JSDOM } from "jsdom";
import type { ComponentProps } from "react";
import type { Root } from "react-dom/client";
import type {
  AccountNotificationIntegrationsResponse,
  NotificationIntegrationInput,
} from "../apps/slots/src/lib/api";

const checked: string[] = [];

setupDom();

const React = await import("react");
Object.defineProperty(globalThis, "React", { value: React, configurable: true });
const { createRoot } = await import("react-dom/client");
const { Simulate } = await import("react-dom/test-utils");
const { WorkspaceNotificationsCard } = await import("../apps/slots/src/components/WorkspaceNotificationsCard");

const container = document.getElementById("root");
if (!container) throw new Error("Missing test root");

const root = createRoot(container);

await testLockedState(root);
await testCreateDestination(root);
await testExistingDestinationActions(root);
await testTeamsProviderCopy(root);

await React.act(async () => {
  root.unmount();
});

console.log(JSON.stringify({ ok: true, checked }, null, 2));

async function testLockedState(rootInstance: Root) {
  await renderCard(rootInstance, {
    settings: {
      eligible: false,
      reason: "company_required",
      integrations: [],
    },
  });

  assert(text().includes("Workspace notifications"), "notifications card renders");
  assert(text().includes("Included with Company"), "locked card explains Company gate");
  assert(text().includes("Start Company before configuring Slack or Teams"), "locked card blocks setup");
}

async function testCreateDestination(rootInstance: Root) {
  let created: NotificationIntegrationInput | undefined;
  await renderCard(rootInstance, {
    settings: eligibleSettings([]),
    onCreate: async (input) => {
      created = input;
    },
  });

  assert(text().includes("No destinations yet"), "empty destination state renders");
  await setInput(0, "#interviews");
  await setInput(1, "https://hooks.slack.test/services/abc");
  await click(buttonContaining("Save destination"));

  assert(created?.provider === "slack", "create uses Slack provider by default");
  assert(created?.destinationLabel === "#interviews", "create sends destination label");
  assert(created?.webhookUrl === "https://hooks.slack.test/services/abc", "create sends webhook URL");
}

async function testExistingDestinationActions(rootInstance: Root) {
  let tested = "";
  let disabled = "";
  await renderCard(rootInstance, {
    settings: eligibleSettings([
      {
        id: "integration_slack",
        provider: "slack",
        destinationLabel: "#interviews",
        status: "active",
        lastTestedAt: "2026-05-17T08:00:00.000Z",
        createdAt: "2026-05-17T07:50:00.000Z",
        updatedAt: "2026-05-17T08:00:00.000Z",
      },
    ]),
    onTest: async (integrationId) => {
      tested = integrationId;
    },
    onDisable: async (integrationId) => {
      disabled = integrationId;
    },
  });

  assert(text().includes("#interviews"), "saved destination renders");
  assert(text().includes("Active"), "active destination status renders");
  await click(buttonContaining("Send test"));
  await click(buttonContaining("Disable"));
  assert(tested === "integration_slack", "send test uses integration id");
  assert(disabled === "integration_slack", "disable uses integration id");
}

async function testTeamsProviderCopy(rootInstance: Root) {
  let created: NotificationIntegrationInput | undefined;
  await renderCard(rootInstance, {
    settings: eligibleSettings([]),
    onCreate: async (input) => {
      created = input;
    },
  });

  await click(buttonContaining("Teams"));
  assert(text().includes("Teams Workflows webhook URL"), "Teams setup uses Workflows webhook copy");
  await setInput(0, "Hiring channel");
  await setInput(1, "https://outlook.office.com/webhook/test");
  await click(buttonContaining("Save destination"));

  assert(created?.provider === "teams", "create sends Teams provider");
}

async function renderCard(
  rootInstance: Root,
  props: Partial<ComponentProps<typeof WorkspaceNotificationsCard>>,
) {
  await React.act(async () => {
    rootInstance.render(
      React.createElement(WorkspaceNotificationsCard, {
        settings: props.settings ?? eligibleSettings([]),
        busyKey: props.busyKey,
        notice: props.notice,
        error: props.error,
        onCreate: props.onCreate ?? (async () => undefined),
        onTest: props.onTest ?? (async () => undefined),
        onDisable: props.onDisable ?? (async () => undefined),
      }),
    );
  });
  await flushEffects();
}

function eligibleSettings(
  integrations: AccountNotificationIntegrationsResponse["integrations"],
): AccountNotificationIntegrationsResponse {
  return {
    eligible: true,
    integrations,
  };
}

async function setInput(index: number, value: string) {
  const input = document.querySelectorAll("input").item(index);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing input at index ${index}`);
  }
  await React.act(async () => {
    input.value = value;
    Simulate.change(input);
  });
  await flushEffects();
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
    url: "https://mytimes.co/account",
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
}
