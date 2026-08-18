import assert from "node:assert/strict";
import {
  isPjudMailboxAddress,
  messageIsFromPjud,
} from "@/lib/mail/pjud-sender";

assert.equal(isPjudMailboxAddress("notificaciones@pjud.cl"), true);
assert.equal(isPjudMailboxAddress("Poder Judicial <notificaciones@pjud.cl>"), true);
assert.equal(isPjudMailboxAddress("avisos@notificaciones.pjud.cl"), true);
assert.equal(isPjudMailboxAddress("tablas@corte.cl"), false);
assert.equal(isPjudMailboxAddress("abogado@gmail.com"), false);
assert.equal(isPjudMailboxAddress("notificaciones@pjud.cl.evil.com"), false);
assert.equal(isPjudMailboxAddress("pjud.cl@example.com"), false);

assert.equal(
  messageIsFromPjud({
    fromAddress: "notificaciones@pjud.cl",
    replyTo: "abogado@gmail.com",
  }),
  true
);
assert.equal(
  messageIsFromPjud({
    fromAddress: "abogado@gmail.com",
    returnPath: "bounce@notificaciones.pjud.cl",
  }),
  true
);
assert.equal(
  messageIsFromPjud({
    fromAddress: "tablas@corte.cl",
    replyTo: "socio@estudio.cl",
  }),
  false
);

console.log("mail/pjud-sender.test.ts OK");
