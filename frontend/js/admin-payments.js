const PAYMENTS_API_URL = "http://localhost:5000/api/admin/payments";
const PAYMENT_METHODS_REQUIRING_REFERENCE = ["GCash", "Bank Transfer"];

document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("paymentModal");
    const openBtn = document.getElementById("recordPaymentBtn");
    const closeBtn = document.getElementById("closePaymentModal");
    const cancelBtn = document.getElementById("cancelPayment");
    const form = document.getElementById("paymentForm");
    const formError = document.getElementById("paymentFormError");
    const submitButton = form ? form.querySelector('button[type="submit"]') : null;

    const searchInput = document.getElementById("paymentSearch");
    const statusFilter = document.getElementById("paymentStatusFilter");
    const tableBody = document.getElementById("paymentTableBody");
    const emptyState = document.getElementById("paymentEmpty");
    const feedback = document.getElementById("paymentFeedback");
    const transactionBody = document.getElementById("transactionTableBody");
    const transactionCount = document.getElementById("transactionCount");

    const detailsModal = document.getElementById("paymentDetailsModal");
    const detailsSubtitle = document.getElementById("paymentDetailsSubtitle");
    const detailsFacts = document.getElementById("paymentDetailsFacts");
    const detailsBody = document.getElementById("paymentDetailsBody");
    const detailsEmpty = document.getElementById("paymentDetailsEmpty");
    const detailsError = document.getElementById("paymentDetailsError");

    const STATUS_CLASSES = {
        "Fully Paid": "completed",
        "Partial": "pending",
        "Unpaid": "inactive"
    };

    let accounts = [];

    function authHeaders(extra = {}) {
        return {
            ...extra,
            Authorization: `Bearer ${localStorage.getItem("edtspToken") || ""}`
        };
    }

    function handleUnauthorized() {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
        window.location.href = "../login.html";
    }

    function money(value) {
        const amount = Number(value || 0);
        const hasCents = Math.round(amount * 100) % 100 !== 0;

        return `₱${amount.toLocaleString("en-PH", {
            minimumFractionDigits: hasCents ? 2 : 0,
            maximumFractionDigits: 2
        })}`;
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric"
        });
    }

    function setFeedback(message, isError = false) {
        if (!feedback) return;

        feedback.textContent = message;
        feedback.hidden = !message;
        feedback.classList.toggle("is-error", isError);
    }

    function setFormError(message) {
        if (!formError) return;

        formError.textContent = message;
        formError.hidden = !message;
    }

    // ---------- Data ----------

    async function loadPayments() {
        setFeedback("");

        try {
            const response = await fetch(PAYMENTS_API_URL, {
                headers: authHeaders()
            });

            if (response.status === 401) {
                handleUnauthorized();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to load payment records.");
            }

            accounts = data.accounts || [];

            renderSummary(data.summary || {});
            renderAccounts(accounts);
            renderTransactions(data.transactions || []);
            populateTraineeOptions(accounts);

        } catch (error) {
            console.error("Payment load error:", error);

            accounts = [];
            renderSummary({});
            renderAccounts([]);
            renderTransactions([]);
            populateTraineeOptions([]);
            setFeedback(
                error.message || "Unable to load payment records. Please try again.",
                true
            );
        } finally {
            filterPayments();
        }
    }

    // ---------- Summary ----------

    function renderSummary(summary) {
        const values = {
            totalFees: summary.totalFees || 0,
            totalCollected: summary.totalCollected || 0,
            outstandingBalance: summary.outstandingBalance || 0,
            fullyPaidCount: summary.fullyPaidTrainees || 0
        };

        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);

            if (!element) return;

            element.textContent = id === "fullyPaidCount" ? String(value) : money(value);
        });
    }

    // ---------- Accounts table ----------

    function buildStatusCell(account) {
        const cell = document.createElement("td");
        const badge = document.createElement("span");

        badge.className = `status-badge ${STATUS_CLASSES[account.status] || "inactive"}`;
        badge.textContent = account.status;
        cell.appendChild(badge);

        if (account.needsProgram) {
            const note = document.createElement("small");

            note.className = "field-note";
            note.textContent = "Program unavailable";
            cell.appendChild(note);
        }

        return cell;
    }

    function buildAccountRow(account) {
        const row = document.createElement("tr");

        row.dataset.status = account.status;
        row.dataset.applicationId = account.applicationId;

        const cells = [
            { text: account.traineeId || "—", className: "id" },
            { text: account.fullName, className: "name" },
            { text: account.programName || "—" },
            { text: money(account.fee), className: "num" },
            { text: money(account.amountPaid), className: "num" },
            { text: money(account.balance), className: "num" }
        ];

        cells.forEach(({ text, className }) => {
            const cell = document.createElement("td");

            cell.textContent = text;

            if (className) cell.className = className;

            row.appendChild(cell);
        });

        row.appendChild(buildStatusCell(account));

        const actionCell = document.createElement("td");
        const viewButton = document.createElement("button");

        viewButton.type = "button";
        viewButton.className = "row-action";
        viewButton.textContent = "View";
        viewButton.setAttribute(
            "aria-label",
            `View payments for ${account.fullName}${account.programName ? ` — ${account.programName}` : ""}`
        );
        viewButton.addEventListener("click", () => openDetails(account.applicationId));

        actionCell.appendChild(viewButton);
        row.appendChild(actionCell);

        return row;
    }

    function renderAccounts(list) {
        tableBody.innerHTML = "";

        if (!list.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 8;
            cell.className = "text-center";
            cell.textContent = "No payment accounts found.";
            row.appendChild(cell);
            tableBody.appendChild(row);

            if (emptyState) {
                emptyState.textContent =
                    "No approved trainee accounts yet. Approve an application to start recording payments.";
                emptyState.hidden = false;
            }

            return;
        }

        if (emptyState) emptyState.hidden = true;

        list.forEach(account => tableBody.appendChild(buildAccountRow(account)));
    }

    // ---------- Transactions table ----------

    function renderTransactions(transactions) {
        transactionBody.innerHTML = "";

        if (transactionCount) {
            const count = transactions.length;

            transactionCount.textContent = `${count} record${count === 1 ? "" : "s"}`;
        }

        if (!transactions.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 6;
            cell.className = "text-center";
            cell.textContent = "No payments recorded yet.";
            row.appendChild(cell);
            transactionBody.appendChild(row);

            return;
        }

        transactions.forEach(transaction => {
            const row = document.createElement("tr");
            const traineeCell = document.createElement("td");

            traineeCell.textContent = transaction.traineeName;

            if (transaction.programName) {
                const program = document.createElement("small");

                program.className = "field-note";
                program.textContent = transaction.programName;
                traineeCell.appendChild(program);
            }

            const cells = [
                { text: transaction.receiptNumber, className: "id" },
                traineeCell,
                { text: money(transaction.amount), className: "num" },
                { text: transaction.method },
                { text: formatDate(transaction.paymentDate) },
                { text: transaction.referenceNumber || "—" }
            ];

            cells.forEach(cell => {
                if (cell instanceof HTMLElement) {
                    row.appendChild(cell);
                    return;
                }

                const element = document.createElement("td");

                element.textContent = cell.text;

                if (cell.className) element.className = cell.className;

                row.appendChild(element);
            });

            transactionBody.appendChild(row);
        });
    }

    // ---------- Search + filter ----------

    function filterPayments() {
        if (!tableBody || !searchInput || !statusFilter) return;

        const search = searchInput.value.trim().toLowerCase();
        const status = statusFilter.value;

        Array.from(tableBody.rows).forEach(row => {
            if (!row.dataset.status) return;

            const matchesSearch = row.textContent.toLowerCase().includes(search);
            const matchesStatus = status === "all" || row.dataset.status === status;

            row.style.display = matchesSearch && matchesStatus ? "" : "none";
        });
    }

    searchInput.addEventListener("input", filterPayments);
    statusFilter.addEventListener("change", filterPayments);

    // ---------- Record payment ----------

    function todayValue() {
        const now = new Date();

        return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 10);
    }

    function populateTraineeOptions(list) {
        if (!form) return;

        const select = document.getElementById("paymentTrainee");

        if (!select) return;

        select.innerHTML = "";

        const placeholder = document.createElement("option");

        placeholder.value = "";
        placeholder.textContent = list.length
            ? "Select a trainee account"
            : "No approved trainee accounts";
        select.appendChild(placeholder);

        list.forEach(account => {
            const option = document.createElement("option");
            const idLabel = account.traineeId || "no ID";

            option.value = account.applicationId;
            option.textContent =
                `${account.fullName} — ${account.programName || "Program unavailable"} ` +
                `(${idLabel}) · ${money(account.balance)} left`;
            select.appendChild(option);
        });
    }

    function openPaymentModal() {
        setFormError("");

        const dateInput = document.getElementById("paymentDate");

        if (dateInput && !dateInput.value) {
            dateInput.max = todayValue();
            dateInput.value = todayValue();
        }

        modal.classList.add("show");
    }

    function closePaymentModal() {
        modal.classList.remove("show");
    }

    if (openBtn) openBtn.addEventListener("click", openPaymentModal);
    if (closeBtn) closeBtn.addEventListener("click", closePaymentModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closePaymentModal);

    modal.addEventListener("click", event => {
        if (event.target === modal) closePaymentModal();
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        setFormError("");

        const trainee = document.getElementById("paymentTrainee");
        const amountInput = document.getElementById("paymentAmount");
        const dateInput = document.getElementById("paymentDate");
        const methodInput = document.getElementById("paymentMethod");
        const referenceInput = document.getElementById("referenceNumber");
        const remarksInput = document.getElementById("paymentRemarks");

        const amount = Number(amountInput.value);
        const method = methodInput.value;
        const reference = referenceInput.value.trim();

        if (!trainee.value) {
            setFormError("Please choose a trainee account.");
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            setFormError("Enter a valid payment amount.");
            return;
        }

        if (!dateInput.value) {
            setFormError("Enter a valid payment date.");
            return;
        }

        if (!method) {
            setFormError("Choose a valid payment method.");
            return;
        }

        if (PAYMENT_METHODS_REQUIRING_REFERENCE.includes(method) && !reference) {
            setFormError("A reference number is required for GCash and bank transfers.");
            return;
        }

        const originalLabel = submitButton ? submitButton.textContent : "";

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Saving...";
        }

        try {
            const response = await fetch(PAYMENTS_API_URL, {
                method: "POST",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    applicationId: trainee.value,
                    amount,
                    paymentDate: dateInput.value,
                    method,
                    referenceNumber: reference,
                    remarks: remarksInput.value.trim()
                })
            });

            if (response.status === 401) {
                handleUnauthorized();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to record this payment.");
            }

            form.reset();
            closePaymentModal();
            await loadPayments();
            setFeedback(data.message || "Payment recorded successfully.");

        } catch (error) {
            console.error("Record payment error:", error);
            setFormError(error.message || "Unable to record this payment.");

        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalLabel;
            }
        }
    });

    // ---------- Details dialog ----------

    function addFact(label, value) {
        const wrapper = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");

        term.textContent = label;
        description.textContent = value;
        wrapper.appendChild(term);
        wrapper.appendChild(description);
        detailsFacts.appendChild(wrapper);
    }

    function renderDetailsAccount(account) {
        detailsSubtitle.textContent =
            `${account.fullName} — ${account.programName || "Program unavailable"}`;

        detailsFacts.innerHTML = "";

        addFact("Trainee ID", account.traineeId || "—");
        addFact("Program", account.programName || "Unavailable");
        addFact("Total fee", money(account.fee));
        addFact("Amount paid", money(account.amountPaid));
        addFact("Balance", money(account.balance));

        const statusFact = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        const badge = document.createElement("span");

        badge.className = `status-badge ${STATUS_CLASSES[account.status] || "inactive"}`;
        badge.textContent = account.status;

        term.textContent = "Status";
        description.appendChild(badge);

        if (account.needsProgram) {
            const note = document.createElement("small");

            note.className = "field-note";
            note.textContent = " Program unavailable";
            description.appendChild(note);
        }

        statusFact.appendChild(term);
        statusFact.appendChild(description);
        detailsFacts.appendChild(statusFact);
    }

    function renderDetailsPayments(payments) {
        detailsBody.innerHTML = "";

        if (!payments.length) {
            if (detailsEmpty) detailsEmpty.hidden = false;

            return;
        }

        if (detailsEmpty) detailsEmpty.hidden = true;

        payments.forEach(payment => {
            const row = document.createElement("tr");
            const values = [
                { text: payment.receiptNumber, className: "id" },
                { text: formatDate(payment.paymentDate) },
                { text: payment.method },
                { text: payment.referenceNumber || "—" },
                { text: money(payment.amount), className: "num" },
                { text: payment.remarks || "—" }
            ];

            values.forEach(({ text, className }) => {
                const cell = document.createElement("td");

                cell.textContent = text;

                if (className) cell.className = className;

                row.appendChild(cell);
            });

            detailsBody.appendChild(row);
        });
    }

    async function openDetails(applicationId) {
        detailsModal.classList.add("show");
        detailsSubtitle.textContent = "Loading...";
        detailsFacts.innerHTML = "";
        detailsBody.innerHTML = "";
        detailsError.hidden = true;
        detailsEmpty.hidden = true;

        try {
            const response = await fetch(`${PAYMENTS_API_URL}/${applicationId}`, {
                headers: authHeaders()
            });

            if (response.status === 401) {
                handleUnauthorized();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to load this payment account.");
            }

            renderDetailsAccount(data.account);
            renderDetailsPayments(data.payments || []);

        } catch (error) {
            console.error("Payment details error:", error);
            detailsSubtitle.textContent = "Unable to load this account";
            detailsError.textContent =
                error.message || "Unable to load this payment account.";
            detailsError.hidden = false;
        }
    }

    const closeDetailsBtn = document.getElementById("closePaymentDetails");
    const closeDetailsAction = document.getElementById("closePaymentDetailsBtn");
    const closeDetails = () => detailsModal.classList.remove("show");

    if (closeDetailsBtn) closeDetailsBtn.addEventListener("click", closeDetails);
    if (closeDetailsAction) closeDetailsAction.addEventListener("click", closeDetails);

    detailsModal.addEventListener("click", event => {
        if (event.target === detailsModal) closeDetails();
    });

    // ---------- Boot ----------

    if (tableBody) loadPayments();
});
