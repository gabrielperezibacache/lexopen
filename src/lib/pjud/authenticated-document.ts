/** Session-only PJUD reads. Cookies are scoped to one URL and are never persisted or logged. */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { Page } from "playwright";
import { isPrivateOrLocalHostname } from "@/lib/net/safe-url";

type Address = { address: string; family: number };
type Transport = { resolve?: (hostname: string) => Promise<Address[]>; request?: (url: URL, options: RequestOptions, response: (incoming: IncomingMessage) => void) => ClientRequest };
function official(url: URL) { return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && (url.hostname === "pjud.cl" || url.hostname.endsWith(".pjud.cl")); }
function pathMatches(path: string, cookiePath: string) { return path === cookiePath || path.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`); }
export async function readAuthenticatedPjudDocument(page: Pick<Page,"url"|"context"|"once"|"off">, ref: string, maximum: number, transport: Transport = {}) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController(), close = () => controller.abort();
  try {
    const target = new URL(ref), source = new URL(page.url());
    if (!official(target) || !official(source) || !Number.isSafeInteger(maximum) || maximum < 100 || maximum > 20 * 1024 * 1024) return null;
    page.once("close", close);
    timeout = setTimeout(close, 35_000);
    // BrowserContext filters domain/path/secure/expiry for this exact URL. Recheck defensively.
    const cookies = (await page.context().cookies(target.href)).filter(cookie => {
      const domain = cookie.domain.replace(/^\./, "").toLowerCase();
      const matchesDomain = target.hostname === domain || cookie.domain.startsWith(".") && target.hostname.endsWith(`.${domain}`);
      return matchesDomain && pathMatches(target.pathname, cookie.path || "/") && (cookie.expires < 0 || cookie.expires * 1000 > Date.now()) && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(cookie.name) && !/[\r\n;]/.test(cookie.value);
    });
    const cookie = cookies.sort((a,b)=>b.path.length-a.path.length).map(item => `${item.name}=${item.value}`).join("; ");
    if (cookie.length > 16_384 || controller.signal.aborted) return null;
    const addresses = await Promise.race([
      (transport.resolve || (hostname => lookup(hostname,{all:true,verbatim:true})))(target.hostname),
      new Promise<never>((_,reject) => { controller.signal.addEventListener("abort",()=>reject(new Error("cancelled")),{once:true}); }),
    ]);
    if (!addresses.length || addresses.some(item => ![4,6].includes(item.family) || isIP(item.address) !== item.family || isPrivateOrLocalHostname(item.address) || item.family === 4 && (Number(item.address.split(".")[0]) >= 224 || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(item.address)) || item.family === 6 && !/^[23][0-9a-f]{3}:/i.test(item.address))) return null;
    const pinned = addresses[0];
    return await new Promise<{ bytes: Buffer; contentType: string } | null>(resolve => {
      const options: RequestOptions = {
        method: "GET", agent: false, servername: target.hostname, rejectUnauthorized: true, family: pinned.family,
        signal: controller.signal, headers: { Accept: "application/pdf,*/*", "Accept-Encoding": "identity", ...(cookie ? { Cookie: cookie } : {}) },
        // Pin validated DNS for this socket; a second lookup cannot rebind it to the local network.
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all) callback(null,[{address:pinned.address,family:pinned.family}]);
          else callback(null,pinned.address,pinned.family);
        },
      };
      const outgoing = (transport.request || httpsRequest)(target,options,incoming => {
        void (async () => {
          const contentType = String(incoming.headers["content-type"] || "");
          if (incoming.statusCode !== 200 || /text\/html/i.test(contentType) || incoming.headers["content-encoding"] && incoming.headers["content-encoding"] !== "identity" || Number(incoming.headers["content-length"] || 0) > maximum) { incoming.destroy(); resolve(null); return; }
          let size=0; const chunks: Buffer[]=[];
          try {
            for await (const chunk of incoming) {
              const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk); size+=bytes.length;
              if(size>maximum || chunks.length>4096){incoming.destroy();resolve(null);return;}
              chunks.push(bytes);
            }
            resolve({bytes:Buffer.concat(chunks,size),contentType});
          } catch { incoming.destroy(); resolve(null); }
        })();
      });
      outgoing.once("error",()=>resolve(null));
      outgoing.end();
    });
  } catch { return null; }
  finally { if(timeout)clearTimeout(timeout); page.off("close",close); }
}
