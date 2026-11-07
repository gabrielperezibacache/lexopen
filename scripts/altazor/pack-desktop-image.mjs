/** Export a verified image as a release asset. This command writes local files only. */
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";
import { desktopCliEnvironment, localDesktopEngine } from "../../desktop/altazor-desktop-profile.cjs";
import { maximumArchiveBytes, toolpackName, toolpackReceiptName } from "../../desktop/altazor-toolpack.cjs";

const execute = promisify(execFile);
const profile = JSON.parse(await readFile(new URL("../../desktop/altazor-desktop-profile.json", import.meta.url), "utf8"));
const { version } = JSON.parse(await readFile(new URL("../../desktop/package.json", import.meta.url), "utf8"));
const toolChecks = ["docx", "libreoffice-pdf", "pdf-pages", "ocr-spa-eng", "xlsx", "epub", "bibliography", "local-search", "audio-16khz", "lexopen-wallpaper"];

async function main() {
  if (process.argv.length !== 4) throw new Error("Uso: pack-desktop-image.mjs informe-del-escritorio.json carpeta-nueva");
  const evidence = JSON.parse(await readFile(process.argv[2], "utf8"));
  if (evidence.result !== "passed" || evidence.runtime !== "real-docker-container" || evidence.sourceCommit !== profile.sourceCommit ||
    typeof evidence.sourceRevision !== "string" || !/^[a-f0-9]{40}$/.test(evidence.sourceRevision) ||
    process.env.GITHUB_SHA && evidence.sourceRevision !== process.env.GITHUB_SHA ||
    process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${version}` ||
    typeof evidence.imageId !== "string" || !/^sha256:[a-f0-9]{64}$/.test(evidence.imageId) || evidence.toolchain?.ok !== true ||
    !Array.isArray(evidence.toolchain.checks) || !toolChecks.every(check => evidence.toolchain.checks.includes(check))) {
    throw new Error("Se requiere evidencia satisfactoria del escritorio real con el perfil de herramientas.");
  }
  const engine = await localDesktopEngine();
  if (engine.state !== "engine-ready") throw new Error("Se requiere un motor Docker local con contenedores Linux.");
  const env = desktopCliEnvironment();
  const dockerArgs = ["--host", engine.host];
  const format = '{{.Id}} {{.Os}} {{.Architecture}} {{index .Config.Labels "org.lexopen.altazor.desktop-profile"}} {{index .Config.Labels "org.lexopen.altazor.desktop-source"}}';
  const result = await execute(engine.binary, [...dockerArgs, "image", "inspect", "--format", format, profile.tag], { env, timeout: 3000, maxBuffer: 16 * 1024 });
  const [id, os, architecture, label, source] = result.stdout.trim().split(/\s+/);
  const name = toolpackName(version, architecture);
  if (!name || architecture !== evidence.architecture || id !== evidence.imageId || os !== "linux" || label !== profile.id || source !== profile.sourceCommit) {
    throw new Error("La imagen preparada no coincide con la imagen y el perfil que pasaron las pruebas.");
  }

  const output = resolve(process.argv[3]);
  await mkdir(output, { mode: 0o700 });
  let success = false;
  try {
    const child = spawn(engine.binary, [...dockerArgs, "image", "save", profile.tag], { env, stdio: ["ignore", "pipe", "inherit"] });
    const finished = new Promise(resolve => {
      child.once("error", () => resolve(1));
      child.once("close", code => resolve(code));
    });
    const sha = createHash("sha256");
    let size = 0;
    const measure = new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        if (size > maximumArchiveBytes) return callback(new Error("El paquete comprimido supera el límite de la publicación."));
        sha.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(child.stdout, createGzip({ level: 5 }), measure, createWriteStream(join(output, name), { flags: "wx", mode: 0o600 }));
      if (await finished !== 0 || size < 100) throw new Error("Docker no exportó el paquete de herramientas.");
    } catch (error) {
      if (child.exitCode === null) child.kill();
      await finished;
      throw error;
    }
    const receipt = { version, profile: profile.id, architecture, name, size, sha256: sha.digest("hex"), imageId: id, sourceCommit: source, sourceRevision: evidence.sourceRevision };
    await writeFile(join(output, toolpackReceiptName(architecture)), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    success = true;
    console.log(JSON.stringify(receipt));
  } finally {
    if (!success) await rm(output, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
