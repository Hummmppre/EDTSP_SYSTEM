

document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("paymentModal");
    const openBtn = document.getElementById("recordPaymentBtn");
    const closeBtn = document.getElementById("closePaymentModal");
    const cancelBtn = document.getElementById("cancelPayment");
    const form = document.getElementById("paymentForm");

    const searchInput = document.getElementById("paymentSearch");
    const statusFilter = document.getElementById("paymentStatusFilter");
    const tableBody = document.getElementById("paymentTableBody");

    // Open modal
    openBtn.addEventListener("click", () => {
        modal.classList.add("show");
    });

    // Close modal
    function closeModal() {
        modal.classList.remove("show");
    }

    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
    });

    // Search and filter payment records
    function filterPayments() {
        const search = searchInput.value.toLowerCase();
        const status = statusFilter.value;

        Array.from(tableBody.rows).forEach((row) => {
            const matchesSearch = row.textContent.toLowerCase().includes(search);
            const matchesStatus = status === "all" || row.dataset.status === status;

            row.style.display = matchesSearch && matchesStatus ? "" : "none";
        });
    }

    searchInput.addEventListener("input", filterPayments);
    statusFilter.addEventListener("change", filterPayments);

    // View payment record
    document.querySelectorAll(".row-action[data-trainee]").forEach((button) => {
        button.addEventListener("click", () => {
            const row = button.closest("tr");
            alert("Payment Details\n\n" + row.innerText);
        });
    });

    // Save payment demonstration
    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const trainee = document.getElementById("paymentTrainee");
        const amount = Number(document.getElementById("paymentAmount").value);
        const paymentDate = document.getElementById("paymentDate").value;
        const paymentMethod = document.getElementById("paymentMethod").value;

        if (!trainee.value || amount <= 0 || !paymentDate || !paymentMethod) {
            alert("Please complete all required fields with valid information.");
            return;
        }

        const traineeName = trainee.options[trainee.selectedIndex].text;

        alert(
            "Payment demonstration successful!\n\n" +
            "Trainee: " + traineeName + "\n" +
            "Amount: ₱" + amount.toLocaleString("en-PH") + "\n" +
            "Date: " + paymentDate + "\n" +
            "Method: " + paymentMethod + "\n\n" +
            "This is a frontend demonstration. No payment was saved."
        );

        form.reset();
        closeModal();
    });
});
