
const API_URL = "http://localhost:5000/api/auth";

// =============================
// SHOW / HIDE PASSWORD
// =============================

document.querySelectorAll(".toggle-password").forEach(button => {
    button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.target);

        if (!target) return;

        const isPassword = target.type === "password";

        target.type = isPassword ? "text" : "password";
        button.textContent = isPassword ? "Hide" : "Show";
    });
});


// =============================
// LOGIN FORM
// =============================

const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        const email = document.getElementById("loginEmail").value   .trim();
        const password = document.getElementById("loginPassword").value;

        if (!email || !password) {
            alert("Please complete all required fields.");
            return;
        }

        const submitButton = loginForm.querySelector(
            'button[type="submit"]'
        );

        submitButton.disabled = true;
        submitButton.textContent = "Signing In...";

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
               body: JSON.stringify({
                email,
                password
            })
            });

            const data = await response.json();

            if (!response.ok) {
                alert(data.message || "Login failed.");
                return;
            }

            // Save authentication information
            localStorage.setItem("edtspToken", data.token);
            localStorage.setItem(
                "edtspUser",
                JSON.stringify(data.user)
            );

            alert("Login successful! Welcome, " + data.user.firstName + ".");

            // Redirect according to account role
            if (data.user.role === "admin") {
                window.location.href = "admin/dashboard.html";
            } else {
                window.location.href = "trainee/dashboard.html";
            }

        } catch (error) {
            console.error("Login Error:", error);
            alert("Unable to connect to the server. Please check your connection.");

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Sign In";
        }
    });
}


// =============================
// REGISTRATION FORM
// =============================

const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async event => {
        event.preventDefault();

        const firstName = document.getElementById("firstName").value.trim();
        const lastName = document.getElementById("lastName").value.trim();
        const email = document.getElementById("registerEmail").value.trim();
        const password = document.getElementById("registerPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (!firstName || !lastName || !email || !password || !confirmPassword) {
            alert("Please complete all required fields.");
            return;
        }

        if (password.length < 8) {
            alert("Password must contain at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        const submitButton = registerForm.querySelector(
            'button[type="submit"]'
        );

        submitButton.disabled = true;
        submitButton.textContent = "Creating Account...";

        try {
            const response = await fetch(`${API_URL}/signup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                alert(data.message || "Registration failed.");
                return;
            }

            alert("Account created successfully! You can now sign in.");

            window.location.href = "login.html";

        } catch (error) {
            console.error("Registration Error:", error);
            alert("Unable to connect to the server. Please check your connection.");

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Create Account";
        }
    });
}
