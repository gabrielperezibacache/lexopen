(function () {
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const dataDirEl = document.getElementById("dataDir");
  const versionEl = document.getElementById("version");
  const hostFields = document.getElementById("host-fields");
  const clientFields = document.getElementById("client-fields");
  const continueBtn = document.getElementById("continue");
  const retryBtn = document.getElementById("retry");
  const chooseDataBtn = document.getElementById("choose-data-directory");
  let selectedPgPort = 54329;

  function selectedMode() {
    return document.querySelector('input[name="mode"]:checked')?.value || "host";
  }

  function syncModeUi() {
    const mode = selectedMode();
    hostFields.classList.toggle("hidden", mode !== "host");
    clientFields.classList.toggle("hidden", mode !== "client");
  }

  function setBusy(busy) {
    continueBtn.disabled = busy;
    if (retryBtn) retryBtn.disabled = busy;
    if (chooseDataBtn) chooseDataBtn.disabled = busy;
  }

  function showError(msg) {
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
    if (retryBtn) retryBtn.hidden = !msg;
  }

  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.addEventListener("change", syncModeUi);
  });

  async function hydrate() {
    if (!window.lexopenDesktop) {
      statusEl.textContent = "API desktop no disponible.";
      return;
    }
    const state = await window.lexopenDesktop.getState();
    dataDirEl.textContent = state.dataDir || "";
    document.getElementById("selectedDataDirectory").textContent = state.dataDir || "";
    if (versionEl) versionEl.textContent = state.version ? `v${state.version}` : "";
    if (state.status?.message) statusEl.textContent = state.status.message;
    if (state.status?.phase === "error") showError(state.status.message);
    const cfg = state.config || {};
    if (cfg.mode === "client") {
      document.querySelector('input[name="mode"][value="client"]').checked = true;
    }
    if (cfg.port) document.getElementById("port").value = cfg.port;
    if (cfg.publicUrl) document.getElementById("publicUrl").value = cfg.publicUrl;
    if (cfg.remoteUrl) document.getElementById("remoteUrl").value = cfg.remoteUrl;
    if (cfg.seedDemo) document.getElementById("seedDemo").checked = true;
    selectedPgPort = cfg.pgPort || 54329;
    document.getElementById("updateChecks").checked = cfg.updateChecks !== false;
    document.getElementById("updateChannel").value = cfg.updateChannel === "preview" ? "preview" : "stable";
    syncModeUi();
    window.lexopenDesktop.onStatus((s) => {
      if (s?.message) statusEl.textContent = s.message;
      if (s?.phase === "error") showError(s.message);
      if (s?.phase === "starting-host" || s?.phase === "probing") {
        showError("");
        setBusy(true);
      }
      if (s?.phase === "ready" || s?.phase === "setup") setBusy(false);
    });
  }

  continueBtn.addEventListener("click", async () => {
    showError("");
    setBusy(true);
    statusEl.textContent =
      selectedMode() === "host"
        ? "Arrancando servidor (puede tardar la primera vez)…"
        : "Conectando al PC principal…";
    const payload = {
      mode: selectedMode(),
      port: Number(document.getElementById("port").value) || 3000,
      publicUrl: document.getElementById("publicUrl").value.trim(),
      remoteUrl: document.getElementById("remoteUrl").value.trim(),
      seedDemo: document.getElementById("seedDemo").checked,
      pgPort: selectedPgPort,
      updateChecks: document.getElementById("updateChecks").checked,
      updateChannel: document.getElementById("updateChannel").value,
    };
    const res = await window.lexopenDesktop.saveSetup(payload);
    setBusy(false);
    if (!res?.ok) {
      showError(res?.error || "No se pudo iniciar.");
      statusEl.textContent = "Revise la configuración.";
      return;
    }
    statusEl.textContent = res.updateRecognized
      ? `Actualización reconocida · v${res.version}`
      : "Listo — cargando LexOpen…";
  });

  chooseDataBtn.addEventListener("click", async () => {
    setBusy(true); showError("");
    try {
      const result = await window.lexopenDesktop.chooseDataDirectory();
      if (!result?.ok) { showError(result?.error || "No se pudo usar la carpeta."); return; }
      if (result.cancelled) return;
      dataDirEl.textContent = result.dataDir;
      document.getElementById("selectedDataDirectory").textContent = result.dataDir;
      if (result.port) document.getElementById("port").value = result.port;
      selectedPgPort = result.pgPort || 54329;
      document.getElementById("publicUrl").value = result.publicUrl || "";
      statusEl.textContent = "Carpeta elegida. Continuar abrirá esos datos; no se ha movido ningún archivo.";
    } catch { showError("No se pudo elegir la carpeta. Vuelva a intentarlo."); }
    finally { setBusy(false); }
  });

  if (retryBtn) {
    retryBtn.addEventListener("click", async () => {
      showError("");
      setBusy(true);
      statusEl.textContent = "Reintentando…";
      await window.lexopenDesktop.retry();
      setBusy(false);
    });
  }

  void hydrate();
})();
