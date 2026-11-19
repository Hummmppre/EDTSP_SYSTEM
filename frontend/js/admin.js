// =============================
// PROFILE PICTURE
// =============================

const ADMIN_API_URL = "http://localhost:5000/api/auth";

let adminAvatarObjectUrl = null;

function renderAdminAvatars(url, initials) {
  ["topbarInitials", "profileAvatar"].forEach((id) => {
    const element = document.getElementById(id);

    if (!element) return;

    element.innerHTML = "";

    if (url) {
      const image = document.createElement("img");

      image.className = "avatar__image";
      image.alt = "";
      image.src = url;
      element.appendChild(image);

      return;
    }

    element.textContent = initials || "A";
  });
}

// Reloads the signed-in administrator's picture and paints every avatar on the
// page, falling back to initials when no picture is set.
async function refreshAdminAvatar(initials) {
  const token =
    localStorage.getItem("edtspToken") || sessionStorage.getItem("edtspToken");

  if (!token) return;

  try {
    const response = await fetch(`${ADMIN_API_URL}/profile/avatar`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      renderAdminAvatars(null, initials);
      return;
    }

    const blob = await response.blob();

    if (adminAvatarObjectUrl) URL.revokeObjectURL(adminAvatarObjectUrl);

    adminAvatarObjectUrl = URL.createObjectURL(blob);
    renderAdminAvatars(adminAvatarObjectUrl, initials);
  } catch (error) {
    console.error("Admin avatar error:", error);
    renderAdminAvatars(adminAvatarObjectUrl, initials);
  }
}

window.edtspAdminAvatar = {
  render: renderAdminAvatars,
  refresh: refreshAdminAvatar,
};

document.addEventListener("DOMContentLoaded", () => {
  const token =
    localStorage.getItem("edtspToken") || sessionStorage.getItem("edtspToken");
  const userData =
    localStorage.getItem("edtspUser") || sessionStorage.getItem("edtspUser");

  // Check whether the user is logged in
  if (!token || !userData) {
    window.location.href = "../login.html";
    return;
  }

  let user;

  try {
    user = JSON.parse(userData);
  } catch (error) {
    localStorage.removeItem("edtspToken");
    localStorage.removeItem("edtspUser");
    sessionStorage.removeItem("edtspToken");
    sessionStorage.removeItem("edtspUser");
    window.location.href = "../login.html";
    return;
  }

  // Allow administrator accounts only
  if (user.role !== "admin") {
    window.location.href = "../login.html";
    return;
  }

  // Navigation collapse, drawers, and the account menu are handled by portal.js

  const displayName = `${user.firstName || ""} ${user.lastName || ""}`.trim();

  if (displayName) {
    const initials =
      `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase();
    const nameElement = document.getElementById("topbarName");
    const initialsElement = document.getElementById("topbarInitials");

    if (nameElement) nameElement.textContent = displayName;
    if (initialsElement) initialsElement.textContent = initials || "A";

    // The profile page loads its own picture once the account details arrive.
    if (!document.getElementById("adminProfileForm")) {
      refreshAdminAvatar(initials || "A");
    }
  }

  // Logout confirmation
  const logoutBtn = document.getElementById("logoutBtn");
  const logoutModal = document.getElementById("adminLogoutModal");
  const closeLogoutButton = document.getElementById("closeAdminLogoutModal");
  const cancelLogoutButton = document.getElementById("cancelAdminLogout");
  const confirmLogoutButton = document.getElementById("confirmAdminLogout");

  function closeAdminLogoutModal() {
    logoutModal.classList.remove("show");
    document.body.classList.remove("modal-open");

    const returnFocus =
      document.getElementById("userMenuButton") || logoutBtn;

    if (returnFocus) returnFocus.focus();
  }

  function finishAdminLogout() {
    localStorage.removeItem("edtspToken");
    localStorage.removeItem("edtspUser");
    sessionStorage.removeItem("edtspToken");
    sessionStorage.removeItem("edtspUser");

    window.location.href = "../login.html";
  }

  if (logoutBtn && logoutModal) {
    logoutBtn.addEventListener("click", () => {
      logoutModal.classList.add("show");
      document.body.classList.add("modal-open");
    });

    closeLogoutButton.addEventListener("click", closeAdminLogoutModal);
    cancelLogoutButton.addEventListener("click", closeAdminLogoutModal);
    confirmLogoutButton.addEventListener("click", finishAdminLogout);
  }
  // Pending application badge in the sidebar
  const badges = document.querySelectorAll("[data-pending-count]");

  if (badges.length) {
    fetch("http://localhost:5000/api/admin/applications/pending-count", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data || !data.success) return;

        badges.forEach((badge) => {
          badge.textContent = String(data.count);
          badge.hidden = data.count === 0;
        });
      })
      .catch((error) => {
        console.error("Pending application badge error:", error);
      });
  }
});
