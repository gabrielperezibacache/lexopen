/** Build the LexOpen tool profile from the separately archived, pinned desktop source. */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { desktopCliEnvironment, dockerDesktopRoot, localDesktopEngine } from "../../desktop/altazor-desktop-profile.cjs";

const profile = JSON.parse(readFileSync(new URL("../../desktop/altazor-desktop-profile.json", import.meta.url), "utf8"));
const recipe = fileURLToPath(new URL("./desktop-profile/", import.meta.url));

async function main() {
  if (process.argv.length !== 3) throw new Error("Indica la carpeta archivada del escritorio en la revisión fijada.");
  const archived = realpathSync(process.argv[2]);
  if (existsSync(join(archived, ".git")) || readFileSync(join(archived, ".lexopen-source-commit"), "utf8").trim() !== profile.sourceCommit) {
    throw new Error("Usa un archivo del código oficial en la revisión fijada. Consulta la guía del escritorio.");
  }
  const engine = await localDesktopEngine();
  if (engine.state !== "engine-ready") throw new Error("Abre un motor Docker local con contenedores Linux y vuelve a intentarlo.");

  const root = mkdtempSync(join(tmpdir(), "lexopen-altazor-image-"));
  try {
    const context = join(root, "context"), config = join(root, "docker-config"), imageFile = join(root, "image-id");
    cpSync(join(archived, "docker", "kitty-desktop"), context, { recursive: true });
    mkdirSync(config, { mode: 0o700 });
    const desktop = dockerDesktopRoot();
    if (desktop) {
      writeFileSync(join(config, "config.json"), JSON.stringify({ cliPluginsExtraDirs: [join(desktop, "cli-plugins")] }), { mode: 0o600 });
    }
    const toolFiles = join(context, ".lexopen-desktop-profile");
    mkdirSync(toolFiles);
    for (const file of ["check.py", "managed-install.sh", "reading.py", "browser-read.js", "desktop-items-0.conf"]) cpSync(join(recipe, file), join(toolFiles, file));
    cpSync(fileURLToPath(new URL("../../public/branding/lexopen-desktop-midnight-2560.png", import.meta.url)), join(toolFiles, "wallpaper.png"));
    const adapted = spawnSync("python3", [join(recipe, "adapt_desktop.py"), context], { encoding: "utf8", windowsHide: true });
    if (adapted.status !== 0) throw new Error("No se pudo preparar el lector semántico del escritorio fijado.");
    const dockerfile = join(context, "Dockerfile");
    const combined = readFileSync(dockerfile, "utf8") + "\n" + readFileSync(join(recipe, "Dockerfile.suffix"), "utf8");
    writeFileSync(dockerfile, combined);

    const env = { ...desktopCliEnvironment(), DOCKER_BUILDKIT: "1" };
    function docker(args, capture = false) {
      const result = spawnSync(engine.binary, ["--config", config, "--host", engine.host, ...args], {
        env, encoding: "utf8", windowsHide: true, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      });
      if (result.status !== 0) throw new Error("Docker no confirmó la preparación del escritorio.");
      return result.stdout?.trim();
    }
    docker(["build", "--build-arg", `LUMEN_COMMIT=${profile.windowManagerCommit}`,
      "--build-arg", `LEXOPEN_DESKTOP_PROFILE=${profile.id}`, "--build-arg", `LEXOPEN_DESKTOP_SOURCE=${profile.sourceCommit}`,
      "--iidfile", imageFile, context]);
    const id = readFileSync(imageFile, "utf8").trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(id) || docker(["image", "inspect", "--format", "{{.Id}}", id], true) !== id) {
      throw new Error("No se pudo confirmar la imagen local con su identificador inmutable.");
    }
    docker(["image", "tag", id, profile.tag]);
    if (process.env.LEXOPEN_DESKTOP_IMAGE_ID_FILE) writeFileSync(process.env.LEXOPEN_DESKTOP_IMAGE_ID_FILE, `${id}\n`, { flag: "wx", mode: 0o600 });
    console.log(`Herramientas verificadas en ${profile.tag}. Usa este identificador en containers.image del proveedor dedicado:\n${id}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
