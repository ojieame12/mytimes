export type ShareEvent = {
  title: string;
  organizerName: string;
};

export function buildShareMessage(event: ShareEvent, publicURL: string): string {
  return [
    "Hi,",
    "",
    `Please choose one available time for ${event.title}:`,
    publicURL,
    "",
    "The booking page will show times in your local timezone.",
    "",
    "Thanks",
    event.organizerName,
  ].join("\n");
}
