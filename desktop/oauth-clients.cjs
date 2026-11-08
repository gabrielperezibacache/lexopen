"use strict";

const DISTRIBUTED_OAUTH_ENV = "ALTAZOR_DISTRIBUTED_OAUTH";
const MAX_DISTRIBUTED_OAUTH_BYTES = 16 * 1024;
const invalid = () => new Error("El perfil público de conexiones no es válido.");
const tokenLike = /^(?:Bearer\s|gh[pousr]_|github_pat_|ya29\.|1\/\/|-----BEGIN)/i;

function record(value, allowed, required = allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== "string" || !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(descriptors, key)) ||
      Object.values(descriptors).some(descriptor => !Object.hasOwn(descriptor, "value"))) throw invalid();
  return value;
}

function value(text, maximum, pattern) {
  if (typeof text !== "string" || !text || text.length > maximum || !pattern.test(text) || tokenLike.test(text)) throw invalid();
  return text;
}

/** Parse only the publisher's explicitly public installed/device client profile. */
function parseDistributedOAuthProfile(raw) {
  let input = raw;
  try {
    if (typeof raw === "string") {
      if (Buffer.byteLength(raw, "utf8") > MAX_DISTRIBUTED_OAUTH_BYTES) throw invalid();
      input = JSON.parse(raw);
    }
    record(input, ["schemaVersion", "google", "github", "dropbox", "microsoft"], ["schemaVersion"]);
    if (input.schemaVersion !== 1 || !["google", "github", "dropbox", "microsoft"].some(provider => Object.hasOwn(input, provider))) throw invalid();
    const result = { schemaVersion: 1 };
    if (Object.hasOwn(input, "google")) {
      const google = record(input.google, ["type", "client_id", "client_secret"]);
      if (google.type !== "installed") throw invalid();
      result.google = Object.freeze({ type: "installed",
        client_id: value(google.client_id, 1000, /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/),
        // This is Google's installed-client parameter, not an operator's web
        // application secret. The publisher must obtain an installed client.
        client_secret: value(google.client_secret, 4000, /^[A-Za-z0-9._~-]+$/),
      });
    }
    if (Object.hasOwn(input, "github")) {
      const github = record(input.github, ["type", "client_id"]);
      if (github.type !== "device") throw invalid();
      result.github = Object.freeze({ type: "device", client_id: value(github.client_id, 200, /^[A-Za-z0-9_.-]{8,200}$/) });
    }
    for (const provider of ["dropbox", "microsoft"]) if (Object.hasOwn(input, provider)) {
      const entry = record(input[provider], ["type", "client_id"]);
      if (entry.type !== "public_client") throw invalid();
      const pattern = provider === "microsoft" ? /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i : /^[A-Za-z0-9_-]{8,200}$/;
      result[provider] = Object.freeze({ type: "public_client", client_id: value(entry.client_id, 200, pattern) });
    }
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_DISTRIBUTED_OAUTH_BYTES) throw invalid();
    return Object.freeze(result);
  } catch { throw invalid(); }
}

/** Public installers share one publisher identity; Microsoft remains optional. */
function requirePublishableOAuthProviders(providers) {
  const supported = ["google", "github", "dropbox", "microsoft"];
  if (!Array.isArray(providers) || providers.length > supported.length ||
      providers.some(provider => !supported.includes(provider)) || new Set(providers).size !== providers.length ||
      !supported.slice(0, 3).every(provider => providers.includes(provider))) {
    throw new Error("La publicación requiere las conexiones públicas de Google, GitHub y Dropbox.");
  }
  return Object.freeze(supported.filter(provider => providers.includes(provider)));
}

/** No file is read, nor any environment value replaced, when one is configured. */
function applyDistributedOAuthProfile(file, targetEnv = process.env) {
  const current = targetEnv[DISTRIBUTED_OAUTH_ENV];
  if (current !== undefined && current !== "") return parseDistributedOAuthProfile(current);
  if (!file) return null;
  const fs = require("node:fs");
  let descriptor;
  try {
    const before = fs.lstatSync(file);
    if (before.isSymbolicLink() || !before.isFile() || before.size > MAX_DISTRIBUTED_OAUTH_BYTES) throw invalid();
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(descriptor), after = fs.lstatSync(file);
    if (!opened.isFile() || after.isSymbolicLink() || opened.size > MAX_DISTRIBUTED_OAUTH_BYTES ||
        before.ino !== opened.ino || before.dev !== opened.dev || after.ino !== opened.ino || after.dev !== opened.dev) throw invalid();
    const bytes = Buffer.alloc(MAX_DISTRIBUTED_OAUTH_BYTES + 1);
    const count = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
    if (count > MAX_DISTRIBUTED_OAUTH_BYTES || count !== opened.size) throw invalid();
    const profile = parseDistributedOAuthProfile(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, count)));
    targetEnv[DISTRIBUTED_OAUTH_ENV] = JSON.stringify(profile);
    return profile;
  } catch (error) {
    if (descriptor === undefined && error?.code === "ENOENT") return null;
    throw invalid();
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

module.exports = { DISTRIBUTED_OAUTH_ENV, MAX_DISTRIBUTED_OAUTH_BYTES, parseDistributedOAuthProfile, requirePublishableOAuthProviders, applyDistributedOAuthProfile };
