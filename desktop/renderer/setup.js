(function () {
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const dataDirEl = document.getElementById("dataDir");
  const hostFields = document.getElementById("host-fields");
  const clientFields = document.getElementById("client-fields");
  const continueBtn = document.getElementById("continue");

  function selectedMode() {
    return document.querySelector('input[name="mode"]:checked')?.value || "host";
  }

  function syncModeUi() {
    const mode = selectedMode();
    hostFields.classList.toggle("hidden", mode !== "host");
    clientFields.classList.toggle("hidden", mode !== "client");
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
    if (state.status?.message) statusEl.textContent = state.status.message;
    const cfg = state.config || {};
    if (cfg.mode === "client") {
      document.querySelector('input[name="mode"][value="client"]').checked = true;
    }
    if (cfg.port) document.getElementById("port").value = cfg.port;
    if (cfg.publicUrl) document.getElementById("publicUrl").value = cfg.publicUrl;
    if (cfg.remoteUrl) document.getElementById("remoteUrl").value = cfg.remoteUrl;
    if (cfg.seedDemo) document.getElementById("seedDemo").checked = true;
    syncModeUi();
    window.lexopenDesktop.onStatus((s) => {
      if (s?.message) statusEl.textContent = s.message;
    });
  }

  continueBtn.addEventListener("click", async () => {
    errorEl.hidden = true;
    continueBtn.disabled = true;
    statusEl.textContent = "Guardando…";
    const payload = {
      mode: selectedMode(),
      port: Number(document.getElementById("port").value) || 3000,
      publicUrl: document.getElementById("publicUrl").value.trim(),
      remoteUrl: document.getElementById("remoteUrl").value.trim(),
      seedDemo: document.getElementById("seedDemo").checked,
    };
    const res = await window.lexopenDesktop.saveSetup(payload);
    continueBtn.disabled = false;
    if (!res?.ok) {
      errorEl.hidden = false;
      errorEl.textContent = res?.error || "No se pudo iniciar.";
      statusEl.textContent = "Revise la configuración.";
      return;
    }
    statusEl.textContent = "Listo — cargando LexOpen…";
  });

  void hydrate();
})();
