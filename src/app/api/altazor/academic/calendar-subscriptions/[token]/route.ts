import { readCalendarFeed } from "@/lib/altazor/calendar-feed";
import { canReadCalendarFeed } from "@/lib/altazor/calendar-feed-policy";

export const runtime = "nodejs";
type Params = { params: Promise<{ token: string }> };
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

async function feed(request: Request, { params }: Params) {
  if (!canReadCalendarFeed(request)) return new Response(null, { status: 404, headers });
  try {
    const { token } = await params;
    const content = await readCalendarFeed(token);
    return new Response(request.method === "HEAD" ? null : content, {
      headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8" },
    });
  } catch (error) {
    // The credential and full request URL never go through application logging.
    const status = (error as { status?: number })?.status === 404 ? 404 : 503;
    return new Response(null, { status, headers });
  }
}

export const GET = feed;
export const HEAD = feed;
