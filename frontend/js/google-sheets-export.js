document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-google-sheets-export]").forEach((button) => {
    button.addEventListener("click", async () => {
      const dataset = button.dataset.googleSheetsExport;
      const status = document.getElementById("googleSheetsExportStatus");
      const token =
        localStorage.getItem("edtspToken") ||
        sessionStorage.getItem("edtspToken");

      if (!token) {
        if (status) {
          status.hidden = false;
          status.textContent = "Your session expired. Sign in again and retry.";
        }
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
          `http://localhost:5000/api/admin/exports/${encodeURIComponent(dataset)}/google-sheets`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Unable to create the spreadsheet.");
        }

        if (status) {
          status.replaceChildren(document.createTextNode("Export ready: "));

          const link = document.createElement("a");
          link.href = data.spreadsheetUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Open Google Sheet";
          status.appendChild(link);
        }
      } catch (error) {
        console.error("Google Sheets export error:", error);

        if (status) {
          status.hidden = false;
          status.textContent =
            error.message || "Unable to create the spreadsheet.";
        }
      } finally {
        button.disabled = false;
        button.innerHTML = originalMarkup;
      }
    });
  });
});
