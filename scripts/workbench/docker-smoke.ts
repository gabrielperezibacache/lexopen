/** CI-only, real Docker, exclusively fictitious inputs. Never inspect a study's runtime. */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { assertPlainDocx, dockerConfig, executeDocumentRecipe, runDockerCommand, runtimeCapabilities } from "../../src/lib/workbench/runtime";
if (process.env.CI !== "true" || process.env.LEXOPEN_WORKBENCH_TEST_DOCKER !== "1") throw Error("This real Docker probe requires CI=true and the explicit fictitious-test flag");
async function main() {
  const config = dockerConfig(); assert.equal((await runtimeCapabilities(config)).available, true);
  const sourceSha256 = createHash("sha256").update("Fictitious source only").digest("hex"), control = new AbortController();
  const artifacts = await executeDocumentRecipe({ version: 1, title: "Borrador ficticio de validación", body: "Texto de prueba con acentos: análisis, información y revisión.\n\n[^R1]", sources: [{ marker: "R1", title: "Documento ficticio", quote: "Un pasaje de prueba que no pertenece a ningún expediente real.", href: "/documentos/fictitious/fuentes", versionId: "version-fictitious", sourceSha256 }] }, control.signal, { config });
  assert.equal(artifacts.length, 2); assertPlainDocx(artifacts.find(artifact => artifact.name.endsWith(".docx"))!.data);
  assert.match(artifacts.find(artifact => artifact.name.endsWith(".md"))!.data.toString("utf8"), /análisis/);
  // A separate controlled probe verifies the actual Linux namespace and security settings.
  const probe = `import os,socket,json\ns=socket.socket();s.settimeout(1)\ntry:\n s.connect(('1.1.1.1',443));network=True\nexcept OSError: network=False\nprint(json.dumps({'uid':os.getuid(),'network':network,'docker_socket':os.path.exists('/var/run/docker.sock'),'private_host_path':os.path.exists('/host')}))`;
  const result = JSON.parse(await runDockerCommand(["run", "--rm", "--pull", "never", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65532:65532", "--memory", "256m", "--cpus", "1", "--pids-limit", "64", "--entrypoint", "python3", config.imageId, "-I", "-B", "-c", probe], { config, timeoutMs: 10_000 }));
  assert.deepEqual(result, { uid: 65532, network: false, docker_socket: false, private_host_path: false });
  const output = process.env.LEXOPEN_WORKBENCH_TEST_OUTPUT || await mkdtemp(path.join(tmpdir(), "lexopen-workbench-ci-output-"));
  try { for (const artifact of artifacts) await writeFile(path.join(output, artifact.name), artifact.data); console.log(JSON.stringify({ runtime: "real-local-docker", imageId: config.imageId, formats: artifacts.map(a => ({ name: a.name, sha256: a.sha256, bytes: a.data.length })), isolationProbe: result, output })); }
  finally { if (!process.env.LEXOPEN_WORKBENCH_TEST_OUTPUT) await rm(output, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
