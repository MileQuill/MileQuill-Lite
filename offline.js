export function setupOffline() {
  const label = document.getElementById("offline-status");
  const dot = document.getElementById("status-dot");
  const button = document.getElementById("update");
  const workers = navigator.serviceWorker;
  let registration;
  let failed = false;
  let applying = false;
  let timer;

  function render() {
    const ready = Boolean(workers?.controller);
    const online = navigator.onLine;
    label.textContent = ready ? (online ? "Offline ready" : "Offline")
      : failed ? "Offline setup unavailable" : online ? "Setting up offline" : "Offline setup pending";
    dot.dataset.state = ready ? (online ? "ready" : "offline") : "pending";
    button.hidden = !registration?.waiting;
  }

  function watch(worker) {
    worker?.addEventListener("statechange", () => {
      if (worker.state === "redundant" && !workers.controller) failed = true;
      render();
    });
  }

  window.addEventListener("online", () => {
    render();
    registration?.update().catch(() => {});
  });
  window.addEventListener("offline", render);
  if (!workers) {
    failed = true;
    render();
    return;
  }

  workers.addEventListener("controllerchange", () => {
    if (applying) {
      clearTimeout(timer);
      location.reload();
    } else render();
  });
  button.addEventListener("click", () => {
    if (!registration?.waiting) return;
    applying = true;
    button.disabled = true;
    button.textContent = "Applying…";
    registration.waiting.postMessage("milequill-lite:apply-update");
    timer = setTimeout(() => {
      applying = false;
      button.disabled = false;
      button.textContent = "Apply update";
      render();
    }, 8000);
  });
  workers.register("./sw.js", { scope: "./", updateViaCache: "none" }).then(result => {
    registration = result;
    watch(registration.installing);
    registration.addEventListener("updatefound", () => watch(registration.installing));
    render();
  }).catch(() => {
    failed = true;
    render();
  });
  render();
}
