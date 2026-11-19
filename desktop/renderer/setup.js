(function () {
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const english = navigator.language.toLowerCase().startsWith("en");
  const tr = (es, en) => english ? en : es;
  if (english) {
    document.documentElement.lang = "en";
    for (const element of document.querySelectorAll("[data-en]")) element.textContent = element.dataset.en;
  }
  const versionEl = document.getElementById("version");
  const hostFields = document.getElementById("host-fields");
  const clientFields = document.getElementById("client-fields");
  const continueBtn = document.getElementById("continue");
  const retryBtn = document.getElementById("retry");
  const chooseDataBtn = document.getElementById("choose-data-directory");
  const prepareDesktopBtn = document.getElementById("prepare-altazor-desktop");
  const desktopStatusEl = document.getElementById("altazor-desktop-status");
  let selectedPgPort = 54329;

  function selectedMode() {
    return document.querySelector('input[name="mode"]:checked')?.value || "host";
  }

  function syncModeUi() {
    const mode = selectedMode();
    hostFields.classList.toggle("hidden", mode !== "host");
    clientFields.classList.toggle("hidden", mode !== "client");
    document.getElementById("host-options").hidden = mode !== "host";
  }

  function setBusy(busy) {
    continueBtn.disabled = busy;
    document.querySelector("fieldset.modes").disabled = busy;
    if (retryBtn) retryBtn.disabled = busy;
    if (chooseDataBtn) chooseDataBtn.disabled = busy;
  }

  function showError(msg, retryStoredConfig = false) {
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
    if (retryBtn) retryBtn.hidden = !msg || !retryStoredConfig;
  }

  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.addEventListener("change", () => {
      syncModeUi();
      if (selectedMode() === "host") void prepareDesktop();
    });
  });

  async function hydrate() {
    if (!window.lexopenDesktop) {
      statusEl.textContent = tr("API desktop no disponible.", "Desktop connection unavailable.");
      return;
    }
    window.lexopenDesktop.onAltazorPreparation(renderDesktopPreparation);
    const state = await window.lexopenDesktop.getState();
    renderDesktopPreparation(state.desktopPreparation);
    document.getElementById("selectedDataDirectory").textContent = state.dataDir || "";
    if (versionEl) versionEl.textContent = state.version ? `v${state.version}` : "";
    if (state.status?.message) statusEl.textContent = state.status.message;
    if (state.status?.phase === "error") showError(state.status.message, true);
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
    setBusy(false);
    if (cfg.mode === "host") void prepareDesktop();
    window.lexopenDesktop.onStatus((s) => {
      if (s?.message) statusEl.textContent = s.message;
      if (s?.phase === "error") showError(s.message, true);
      if (s?.phase === "starting-host" || s?.phase === "probing") {
        showError("");
        setBusy(true);
      }
      if (s?.phase === "ready" || s?.phase === "setup") setBusy(false);
    });
  }

  continueBtn.addEventListener("click", async () => {
    const remote = document.getElementById("remoteUrl");
    if (selectedMode() === "client" && !remote.reportValidity()) return;
    showError("");
    setBusy(true);
    statusEl.textContent =
      selectedMode() === "host"
        ? tr("Arrancando servidor (puede tardar la primera vez)…", "Starting the server. The first launch may take a moment…")
        : tr("Conectando al PC principal…", "Connecting to the Host…");
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
    let res;
    try {
      res = await window.lexopenDesktop.saveSetup(payload);
    } catch {
      showError(tr("Se interrumpió la conexión. Revisa el estado del Host antes de reintentar.", "Connection interrupted. Check the Host status before retrying."));
      statusEl.textContent = "";
      return;
    } finally { setBusy(false); }
    if (!res?.ok) {
      showError(res?.error || tr("No se pudo iniciar.", "Unable to start."));
      statusEl.textContent = tr("Revise la configuración.", "Check your settings.");
      return;
    }
    statusEl.textContent = res.updateRecognized
      ? tr(`Actualización reconocida · v${res.version}`, `Update recognized · v${res.version}`)
      : tr("Listo — cargando LexOpen…", "Opening LexOpen…");
  });

  chooseDataBtn.addEventListener("click", async () => {
    setBusy(true); showError("");
    try {
      const result = await window.lexopenDesktop.chooseDataDirectory();
      if (!result?.ok) { showError(result?.error || tr("No se pudo usar la carpeta.", "Unable to use that folder.")); return; }
      if (result.cancelled) return;
      document.getElementById("selectedDataDirectory").textContent = result.dataDir;
      if (result.port) document.getElementById("port").value = result.port;
      selectedPgPort = result.pgPort || 54329;
      document.getElementById("publicUrl").value = result.publicUrl || "";
      statusEl.textContent = tr("Carpeta elegida. Pulsa Continuar para abrir sus datos.", "Folder selected. Continue to open its data.");
    } catch { showError(tr("No se pudo elegir la carpeta. Vuelva a intentarlo.", "Unable to select a folder. Try again.")); }
    finally { setBusy(false); }
  });

  function renderDesktopPreparation(status) {
    if (!status) return;
    desktopStatusEl.hidden = false;
    desktopStatusEl.textContent = status.message;
    const ready = ["package-loaded", "profile-detected"].includes(status.state);
    prepareDesktopBtn.disabled = Boolean(status.busy);
    prepareDesktopBtn.textContent = status.busy ? tr("Preparando…", "Preparing…") : ready ? tr("Comprobar de nuevo", "Check again") : tr("Volver a intentar", "Try again");
  }

  async function prepareDesktop(retry = false) {
    renderDesktopPreparation({ busy: true, message: tr("Comprobando el escritorio…", "Checking the desktop…") });
    try {
      renderDesktopPreparation(await window.lexopenDesktop.prepareAltazorDesktop(retry));
    } catch {
      renderDesktopPreparation({ message: tr("No se pudo preparar el escritorio. Vuelve a intentar.", "Unable to prepare the desktop. Try again.") });
    }
  }

  prepareDesktopBtn.addEventListener("click", () => void prepareDesktop(true));

  document.getElementById("desktop-guide").addEventListener("click", () => {
    void window.lexopenDesktop.openExternal("https://github.com/gabrielperezibacache/lexopen/blob/main/docs/ESCRITORIO-ALTAZOR.md");
  });

  if (retryBtn) {
    retryBtn.addEventListener("click", async () => {
      showError("");
      setBusy(true);
      statusEl.textContent = tr("Reintentando…", "Retrying…");
      try {
        await window.lexopenDesktop.retry();
      } catch {
        showError(tr("No se pudo reintentar. Comprueba la conexión con el Host.", "Unable to retry. Check the Host connection."), true);
      } finally { setBusy(false); }
    });
  }

  void hydrate().catch(() => showError(tr("No se pudo leer la configuración. Vuelve a abrir LexOpen.", "Unable to load the settings. Reopen LexOpen.")));
})();
