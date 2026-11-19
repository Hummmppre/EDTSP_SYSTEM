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

  function adminInitials(firstName, lastName) {
    return (
      `${(firstName || "")[0] || ""}${(lastName || "")[0] || ""}`
        .toUpperCase()
        .trim() || "A"
    );
  }

  function setAdminName(firstName, lastName) {
    const name = `${firstName} ${lastName}`.trim();
    const element = document.getElementById("topbarName");

    if (element) element.textContent = name;
  }

  // Repaints the top-bar and editor avatars from the stored picture, or from
  // the new initials when no picture is set. An unsaved preview wins until the
  // administrator saves or reloads.
  function syncAdminAvatars(firstName, lastName) {
    if (pendingAvatarPreviewUrl) return;

    const avatars = window.edtspAdminAvatar;

    if (avatars) avatars.refresh(adminInitials(firstName, lastName));
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
      syncAdminAvatars(profile.firstName || "", profile.lastName || "");
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
      syncAdminAvatars(data.profile.firstName, data.profile.lastName);
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

  // =============================
  // PROFILE PICTURE UPLOAD
  // =============================

  const avatarInput = document.getElementById("adminAvatarInput");
  const avatarChoose = document.getElementById("adminAvatarChoose");
  const avatarSave = document.getElementById("adminAvatarSave");
  const avatarMessage = document.getElementById("adminAvatarMessage");
  const avatarError = document.getElementById("adminAvatarError");
  const avatarImage = document.getElementById("profileAvatar");

  const AVATAR_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

  let pendingAvatarFile = null;
  let pendingAvatarPreviewUrl = null;

  function setAvatarMessages(message, error) {
    if (avatarMessage) {
      avatarMessage.textContent = message || "";
      avatarMessage.hidden = !message;
    }

    if (avatarError) {
      avatarError.textContent = error || "";
      avatarError.hidden = !error;
    }
  }

  function renderAvatarPreview(url) {
    if (!avatarImage) return;

    avatarImage.innerHTML = "";

    if (url) {
      const image = document.createElement("img");

      image.className = "avatar__image";
      image.alt = "";
      image.src = url;
      avatarImage.appendChild(image);

      return;
    }

    avatarImage.textContent = adminInitials(
      elements.firstName.value,
      elements.lastName.value,
    );
  }

  if (avatarInput && avatarChoose && avatarSave) {
    avatarChoose.addEventListener("click", () => avatarInput.click());

    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files && avatarInput.files[0];

      if (!file) return;

      if (!AVATAR_TYPES.includes(file.type)) {
        setAvatarMessages("", "Choose a JPG, PNG or WebP image.");
        avatarInput.value = "";
        return;
      }

      if (!file.size) {
        setAvatarMessages("", "That file is empty. Choose another image.");
        avatarInput.value = "";
        return;
      }

      if (file.size > AVATAR_MAX_BYTES) {
        setAvatarMessages("", "Your profile picture must be 2 MB or smaller.");
        avatarInput.value = "";
        return;
      }

      if (pendingAvatarPreviewUrl) URL.revokeObjectURL(pendingAvatarPreviewUrl);

      pendingAvatarFile = file;
      pendingAvatarPreviewUrl = URL.createObjectURL(file);

      renderAvatarPreview(pendingAvatarPreviewUrl);
      setAvatarMessages("Preview ready. Save to update your picture.", "");
      avatarSave.disabled = false;
      avatarInput.value = "";
    });

    avatarSave.addEventListener("click", async () => {
      if (!pendingAvatarFile) return;

      const formData = new FormData();

      formData.append("avatar", pendingAvatarFile);

      avatarSave.disabled = true;
      avatarSave.textContent = "Saving…";
      setAvatarMessages("", "");

      try {
        const response = await fetch(`${API_URL}/profile/avatar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
          clearSessionAndRedirect();
          return;
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || "Unable to save your profile picture.",
          );
        }

        const previewUrl = pendingAvatarPreviewUrl;

        pendingAvatarPreviewUrl = null;
        pendingAvatarFile = null;

        if (previewUrl) URL.revokeObjectURL(previewUrl);

        const avatars = window.edtspAdminAvatar;

        if (avatars) {
          await avatars.refresh(
            adminInitials(elements.firstName.value, elements.lastName.value),
          );
        }

        setAvatarMessages(data.message || "Profile picture updated.", "");
      } catch (error) {
        console.error("Save admin avatar error:", error);
        setAvatarMessages(
          "",
          error.message || "Unable to save your profile picture.",
        );
      } finally {
        avatarSave.textContent = "Save photo";
        avatarSave.disabled = !pendingAvatarFile;
      }
    });
  }

  if (!token) {
    clearSessionAndRedirect();
    return;
  }

  loadProfile();
})();
