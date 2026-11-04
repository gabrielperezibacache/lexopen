#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const directory = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.LEXOPEN_WORKBENCH_DOCKER_HOST || "unix:///var/run/docker.sock";
if (!/^unix:\/\/\/[^\r\n\0,]+$/.test(host) && host !== "npipe:////./pipe/docker_engine") throw Error("This build requires an explicitly local Docker socket");
const executable = process.env.LEXOPEN_WORKBENCH_DOCKER_BIN || "docker";
const env = { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR };
const run = (args, capture = false) => { const result = spawnSync(executable, ["--host", host, ...args], { env, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" }); if (result.status !== 0) throw Error("Local Docker build failed"); return (result.stdout || "").trim(); };
run(["build", "--tag", "lexopen-workbench-documents:1", directory]);
const id = run(["image", "inspect", "--format", "{{.Id}}", "lexopen-workbench-documents:1"], true);
if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw Error("Docker did not return an immutable image ID");
console.log("Image built. Configure the Host explicitly; no settings were changed.");
console.log("LEXOPEN_WORKBENCH_ENABLED=1");
console.log("LEXOPEN_WORKBENCH_IMAGE_ID=" + id);
