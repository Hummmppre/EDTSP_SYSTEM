(() => {
  const API_URL = "http://localhost:5000/api/auth";
  const token =
    localStorage.getItem("edtspToken") || sessionStorage.getItem("edtspToken");

  const elements = {
    profileForm: document.getElementById("adminProfileForm"),
    firstName: document.getElementById("adminFirstName"),
    lastName: document.getElementById("adminLastName"),
    email: document.getElementById("adminProfileEmail"),
    role: document.getElementById("adminProfileRole"),
    profileMessage: document.getElementById("profileMessage"),
    profileError: document.getElementById("profileError"),
    passwordForm: document.getElementById("adminPasswordForm"),
    currentPassword: document.getElementById("currentPassword"),
    newPassword: document.getElementById("newPassword"),
    confirmPassword: document.getElementById("confirmNewPassword"),
    passwordMessage: document.getElementById("passwordMessage"),
    passwordError: document.getElementById("passwordError"),
  };

  function clearSessionAndRedirect() {
    localStorage.removeItem("edtspToken");
    localStorage.removeItem("edtspUser");
    sessionStorage.removeItem("edtspToken");
    sessionStorage.removeItem("edtspUser");
    window.location.href = "../login.html";
  }

  async function request(path, method = "GET", body) {
    const options = {
      method,
      headers: { Authorization: `Bearer ${token}` },
    };

    if (body) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_URL}${path}`, options);
    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      clearSessionAndRedirect();
      throw new Error("Your session expired. Please sign in again.");
    }

    if (!response.ok || !data.success) {
      throw new Error(data.message || "The request could not be completed.");
    }

    return data;
  }

  function setAdminName(firstName, lastName) {
    const name = `${firstName} ${lastName}`.trim();
    const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase();

    ["sidebarName", "topbarName"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = name;
    });

    ["userInitials", "topbarInitials"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = initials || "A";
    });
  }

  async function loadProfile() {
    try {
      const data = await request("/profile");
      const profile = data.profile;

      elements.firstName.value = profile.firstName || "";
      elements.lastName.value = profile.lastName || "";
      elements.email.value = profile.email || "";
      elements.role.value = profile.role || "admin";
      setAdminName(profile.firstName || "", profile.lastName || "");
    } catch (error) {
      elements.profileError.textContent = error.message;
      elements.profileError.hidden = false;
    }
  }

  elements.profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.profileMessage.textContent = "";
    elements.profileError.hidden = true;

    try {
      const data = await request("/profile", "PATCH", {
        firstName: elements.firstName.value,
        lastName: elements.lastName.value,
      });

      elements.profileMessage.textContent = data.message || "Profile updated.";
      setAdminName(data.profile.firstName, data.profile.lastName);
    } catch (error) {
      elements.profileError.textContent = error.message;
      elements.profileError.hidden = false;
    }
  });

  elements.passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.passwordMessage.textContent = "";
    elements.passwordError.hidden = true;

    try {
      const data = await request("/profile/password", "PATCH", {
        currentPassword: elements.currentPassword.value,
        newPassword: elements.newPassword.value,
        confirmPassword: elements.confirmPassword.value,
      });

      elements.passwordForm.reset();
      elements.passwordMessage.textContent =
        data.message || "Password updated.";
    } catch (error) {
      elements.passwordError.textContent = error.message;
      elements.passwordError.hidden = false;
    }
  });

  if (!token) {
    clearSessionAndRedirect();
    return;
  }

  loadProfile();
})();
