document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "http://localhost:5000/api/admin/exports";

  function redirectToLogin() {
    localStorage.removeItem("edtspToken");
    localStorage.removeItem("edtspUser");
    sessionStorage.removeItem("edtspToken");
    sessionStorage.removeItem("edtspUser");
    window.location.href = "../login.html";
  }

  function showStatus(status, message) {
    if (!status) return;

    status.hidden = false;
    status.textContent = message;
  }

  function showSheetLink(status, data) {
    if (!status) return;

    const count =
      typeof data.rowCount === "number"
        ? ` (${data.rowCount} ${data.rowCount === 1 ? "record" : "records"})`
        : "";

    status.hidden = false;
    status.replaceChildren(document.createTextNode(`Export ready${count}: `));

    const link = document.createElement("a");
    link.href = data.spreadsheetUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open Google Sheet";
    status.appendChild(link);
  }

  document.querySelectorAll("[data-google-sheets-export]").forEach((button) => {
    button.addEventListener("click", async () => {
      const dataset = button.dataset.googleSheetsExport;
      const status = document.getElementById("googleSheetsExportStatus");
      const token =
        localStorage.getItem("edtspToken") ||
        sessionStorage.getItem("edtspToken");

      if (!token) {
        showStatus(
          status,
          "Your session expired. Sign in again and retry the export.",
        );
        return;
      }

      const originalMarkup = button.innerHTML;
      button.disabled = true;
      button.textContent = "Creating spreadsheet…";

      if (status) {
        status.hidden = false;
        status.textContent = "Preparing the export…";
      }

      try {
        const response = await fetch(
          `${API_URL}/${encodeURIComponent(dataset)}/google-sheets`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.status === 401) {
          redirectToLogin();
          return;
        }

        const body = await response.text();
        let data = {};

        try {
          data = body ? JSON.parse(body) : {};
        } catch (error) {
          console.error("Google Sheets export response error:", error);
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ||
              "Unable to export records to Google Sheets. Please try again.",
          );
        }

        showSheetLink(status, data);
      } catch (error) {
        console.error("Google Sheets export error:", error);

        showStatus(
          status,
          error.message ||
            "Unable to export records to Google Sheets. Please try again.",
        );
      } finally {
        button.disabled = false;
        button.innerHTML = originalMarkup;
      }
    });
  });
});
