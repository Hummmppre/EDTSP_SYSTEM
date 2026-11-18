(() => {
  let region = document.querySelector(".edtsp-toast-region");

  if (!region) {
    region = document.createElement("div");
    region.className = "edtsp-toast-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "false");
    document.body.appendChild(region);
  }

  window.showToast = function (message, type = "info", duration = 4500) {
    const toast = document.createElement("div");
    toast.className = "edtsp-toast";
    toast.dataset.type = type;
    toast.setAttribute("role", type === "error" ? "alert" : "status");

    const text = document.createElement("span");
    text.textContent = String(message);

    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "×";
    close.addEventListener("click", () => toast.remove());

    toast.append(text, close);
    region.appendChild(toast);

    if (duration > 0) {
      window.setTimeout(() => toast.remove(), duration);
    }

    return toast;
  };
})();
