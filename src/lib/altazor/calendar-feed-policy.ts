export const calendarSubscriptionBasePath = "/api/altazor/academic/calendar-subscriptions";
export const calendarSubscriptionTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isCalendarSubscriptionPath(pathname: string) {
  return pathname.startsWith(`${calendarSubscriptionBasePath}/`)
    && calendarSubscriptionTokenPattern.test(pathname.slice(calendarSubscriptionBasePath.length + 1));
}

export function canEnableCalendarFeed(request: Request) {
  try {
    // Only consulted after CSRF validation of the browser's origin.
    const browser = new URL(request.headers.get("origin") || request.headers.get("referer") || "");
    return browser.protocol === "https:" || (browser.protocol === "http:" && localHosts.has(browser.hostname));
  } catch { return false; }
}

export function canReadCalendarFeed(request: Request) {
  try {
    const incoming = new URL(request.url);
    if (incoming.protocol === "https:") return true;
    if (incoming.protocol !== "http:" || !localHosts.has(incoming.hostname)) return false;
    const host = request.headers.get("host");
    return Boolean(host && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/i.test(host));
  } catch { return false; }
}
