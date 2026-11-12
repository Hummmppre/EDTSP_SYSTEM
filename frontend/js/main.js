// Mobile navigation on the landing page
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

if (menuToggle && navLinks) {
    const openIcon = menuToggle.querySelector(".icon-open");
    const closeIcon = menuToggle.querySelector(".icon-close");

    const setOpen = (isOpen) => {
        navLinks.classList.toggle("active", isOpen);
        menuToggle.setAttribute("aria-expanded", String(isOpen));
        menuToggle.classList.toggle("is-open", isOpen);

        if (openIcon && closeIcon) {
            openIcon.hidden = isOpen;
            closeIcon.hidden = !isOpen;
        }
    };

    menuToggle.addEventListener("click", () => {
        setOpen(!navLinks.classList.contains("active"));
    });

    document.querySelectorAll("#navLinks a").forEach((link) => {
        link.addEventListener("click", () => setOpen(false));
    });
}

// Automatically update copyright year
const yearElement = document.getElementById("currentYear");

if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
}
