/** Real loopback SMTP/MIME round trip; no external recipients or credentials. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { simpleParser } from "mailparser";
import { createSmtpProvider } from "./smtp";

async function main() {
  const messages: string[] = [], sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    socket.setTimeout(5000, () => socket.destroy());
    let buffer = "", data: string[] | null = null;
    socket.write("220 localhost ESMTP fixture\r\n");
    socket.on("data", chunk => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") { messages.push(data.join("\r\n")); data = null; socket.write("250 accepted\r\n"); }
          else data.push(line.replace(/^\.\./, "."));
        } else if (/^(EHLO|HELO) /i.test(line)) socket.write("250 localhost\r\n");
        else if (/^(MAIL FROM:|RCPT TO:|RSET)/i.test(line)) socket.write("250 ok\r\n");
        else if (line === "DATA") { data = []; socket.write("354 send message\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("500 unsupported fixture command\r\n");
      }
    });
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const provider = createSmtpProvider({ host: "127.0.0.1", port: address.port, secure: false, from: "LexOpen ficticio <sender@example.invalid>" });
    assert.equal((await provider.health()).ok, true);
    const dedupeKey = "smtp-upgrade-fictitious-delivery";
    const messageId = `<lexopen-${createHash("sha256").update(dedupeKey).digest("hex")}@lexopen.invalid>`;
    const result = await provider.send({ title: "Notificación", subject: "Revisión: acción próxima", text: "Sólo una prueba ficticia.", html: "<p>Sólo una prueba ficticia.</p>" }, { kind: "email", email: "recipient@example.invalid" }, { dedupeKey });
    assert.deepEqual(result, { ok: true, providerMessageId: messageId });
    assert.equal(messages.length, 1);
    const parsed = await simpleParser(messages[0]);
    assert.equal(parsed.messageId, messageId);
    assert.equal(parsed.subject, "Revisión: acción próxima");
    assert.equal(parsed.text?.trim(), "Sólo una prueba ficticia.");
    assert.equal(parsed.html, "<p>Sólo una prueba ficticia.</p>");
    assert.equal(parsed.from?.value[0].address, "sender@example.invalid");
    assert.ok(!Array.isArray(parsed.to));
    assert.equal(parsed.to?.value[0].address, "recipient@example.invalid");
    assert.deepEqual(await provider.send({ title: "Prueba", text: "Ficticio" }, { kind: "telegram", chatId: "test" }), { ok: false, retryable: false, error: "destino no email" });
    assert.equal(messages.length, 1);
    console.log("SMTP/MIME loopback passed: health, delivery, Unicode, recipients, stable message ID and wrong-channel rejection; no external traffic.");
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
