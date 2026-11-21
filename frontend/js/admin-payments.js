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

    const editModal = document.getElementById("editPaymentModal");
    const editForm = document.getElementById("editPaymentForm");
    const editCloseBtn = document.getElementById("closeEditPayment");
    const editCancelBtn = document.getElementById("cancelEditPayment");
    const editSubmitButton = editForm
        ? editForm.querySelector('button[type="submit"]')
        : null;
    const editFormError = document.getElementById("editPaymentFormError");
    const editConflict = document.getElementById("editPaymentConflict");
    const refreshPaymentRecord = document.getElementById("refreshPaymentRecord");
    const realtime = window.EDTSPRealtime;

    let editingPayment = null;

    const STATUS_CLASSES = {
        "Fully Paid": "completed",
        "Partial": "pending",
        "Unpaid": "inactive"
    };

    let accounts = [];

    function authHeaders(extra = {}) {
        return {
            ...extra,
            Authorization: `Bearer ${
    localStorage.getItem("edtspToken") ||
    sessionStorage.getItem("edtspToken") ||
    ""
}`
        };
    }

    function handleUnauthorized() {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
        sessionStorage.removeItem("edtspToken");
        sessionStorage.removeItem("edtspUser");
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

            return data.transactions || [];

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

            return null;
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

        if (account.notEnrolled) {
            const note = document.createElement("small");

            note.className = "field-note";
            note.textContent = "Not currently enrolled";
            cell.appendChild(note);
        }

        return cell;
    }

    function buildAccountRow(account) {
        const row = document.createElement("tr");

        row.dataset.status = account.status;
        row.dataset.accountId = account.id;

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
        viewButton.addEventListener("click", () => openDetails(account.id));

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
                    "No enrolled trainees yet. Enrol a trainee in a program to start recording payments.";
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

            cell.colSpan = 7;
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

            const actionCell = document.createElement("td");
            const editButton = document.createElement("button");

            editButton.type = "button";
            editButton.className = "row-action";
            editButton.textContent = "Edit";
            editButton.setAttribute(
                "aria-label",
                `Edit payment ${transaction.receiptNumber}`
            );
            editButton.addEventListener("click", () => openEditPayment(transaction));

            actionCell.appendChild(editButton);
            row.appendChild(actionCell);

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
            : "No enrolled trainee accounts";
        select.appendChild(placeholder);

        list.forEach(account => {
            const option = document.createElement("option");
            const idLabel = account.traineeId || "no ID";

            option.value = account.id;
            option.textContent =
                `${account.fullName} — ${account.programName || "Program unavailable"} ` +
                `(${idLabel}) · ${money(account.balance)} left`;
            select.appendChild(option);
        });
    }

    function openPaymentModal() {
        clearFieldErrors(form);
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

        [trainee, amountInput, dateInput, methodInput, referenceInput]
            .forEach(field => setFieldError(field, ""));

        if (!trainee.value) {
            setFieldError(trainee, "Choose a trainee account.");
            trainee.focus();
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            setFieldError(amountInput, "Enter a valid payment amount.");
            amountInput.focus();
            return;
        }

        if (!dateInput.value) {
            setFieldError(dateInput, "Enter a valid payment date.");
            dateInput.focus();
            return;
        }

        if (dateInput.max && dateInput.value > dateInput.max) {
            setFieldError(dateInput, "Payment date cannot be in the future.");
            dateInput.focus();
            return;
        }

        if (!method) {
            setFieldError(methodInput, "Choose a valid payment method.");
            methodInput.focus();
            return;
        }

        if (PAYMENT_METHODS_REQUIRING_REFERENCE.includes(method) && !reference) {
            setFieldError(
                referenceInput,
                "A reference number is required for GCash and bank transfers."
            );
            referenceInput.focus();
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
                    accountId: trainee.value,
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

    // ---------- Edit payment ----------

    function setEditFormError(message) {
        if (!editFormError) return;

        editFormError.textContent = message;
        editFormError.hidden = !message;
    }

    function openEditPayment(transaction) {
        editingPayment = transaction;
        clearFieldErrors(editForm);
        setEditFormError("");

        if (editConflict) {
            editConflict.textContent = "";
            editConflict.hidden = true;
        }

        if (refreshPaymentRecord) refreshPaymentRecord.hidden = true;

        document.getElementById("editPaymentReceipt").value =
            transaction.receiptNumber;
        document.getElementById("editPaymentTrainee").value =
            transaction.traineeName;
        document.getElementById("editPaymentAmount").value =
            transaction.amount;
        document.getElementById("editPaymentMethod").value =
            transaction.method;
        document.getElementById("editPaymentReference").value =
            transaction.referenceNumber || "";
        document.getElementById("editPaymentRemarks").value =
            transaction.remarks || "";

        const dateInput = document.getElementById("editPaymentDate");

        dateInput.max = todayValue();
        dateInput.value = String(transaction.paymentDate || "").slice(0, 10);

        if (realtime) realtime.watch("payment", transaction.id);

        editModal.classList.add("show");
    }

    function closeEditPayment() {
        editModal.classList.remove("show");
        editingPayment = null;

        if (realtime) realtime.unwatch();
    }

    // A 409 means another admin saved first. Reload the ledger and reopen this
    // payment with the stored values.
    async function refreshEditingPayment() {
        if (!editingPayment) return;

        const paymentId = editingPayment.id;
        const originalLabel = refreshPaymentRecord
            ? refreshPaymentRecord.textContent
            : "";

        if (refreshPaymentRecord) {
            refreshPaymentRecord.disabled = true;
            refreshPaymentRecord.textContent = "Refreshing...";
        }

        try {
            const transactions = await loadPayments();
            const latest = transactions
                ? transactions.find(transaction => transaction.id === paymentId)
                : null;

            if (latest) {
                openEditPayment(latest);
                setFeedback("Payment refreshed with the latest changes.");
            } else {
                closeEditPayment();
                setFeedback("That payment is no longer available.", true);
            }
        } finally {
            if (refreshPaymentRecord) {
                refreshPaymentRecord.disabled = false;
                refreshPaymentRecord.textContent = originalLabel;
            }
        }
    }

    if (editCloseBtn) editCloseBtn.addEventListener("click", closeEditPayment);
    if (editCancelBtn) editCancelBtn.addEventListener("click", closeEditPayment);
    if (refreshPaymentRecord) {
        refreshPaymentRecord.addEventListener("click", refreshEditingPayment);
    }

    // Another administrator saved this payment first. The stale version stays
    // in the form, so saving still returns 409 until the record is refreshed.
    if (realtime) {
        realtime.onRecordUpdated(payload => {
            if (
                !editingPayment ||
                payload.resource !== "payment" ||
                String(payload.id) !== String(editingPayment.id)
            ) {
                return;
            }

            if (editConflict) {
                editConflict.textContent =
                    "This payment was changed by another user. Refresh the record to see the latest details before saving.";
                editConflict.hidden = false;
            }

            if (refreshPaymentRecord) refreshPaymentRecord.hidden = false;
        });
    }

    if (editModal) {
        editModal.addEventListener("click", event => {
            if (event.target === editModal) closeEditPayment();
        });
    }

    if (editForm) {
        editForm.addEventListener("submit", async event => {
            event.preventDefault();

            if (!editingPayment) return;

            setEditFormError("");

            if (editConflict) editConflict.hidden = true;
            if (refreshPaymentRecord) refreshPaymentRecord.hidden = true;

            const amountInput = document.getElementById("editPaymentAmount");
            const dateInput = document.getElementById("editPaymentDate");
            const methodInput = document.getElementById("editPaymentMethod");
            const referenceInput = document.getElementById(
                "editPaymentReference"
            );
            const remarksInput = document.getElementById("editPaymentRemarks");

            const amount = Number(amountInput.value);
            const method = methodInput.value;
            const reference = referenceInput.value.trim();

            [amountInput, dateInput, methodInput, referenceInput]
                .forEach(field => setFieldError(field, ""));

            if (!Number.isFinite(amount) || amount <= 0) {
                setFieldError(amountInput, "Enter a valid payment amount.");
                amountInput.focus();
                return;
            }

            if (!dateInput.value) {
                setFieldError(dateInput, "Enter a valid payment date.");
                dateInput.focus();
                return;
            }

            if (dateInput.max && dateInput.value > dateInput.max) {
                setFieldError(dateInput, "Payment date cannot be in the future.");
                dateInput.focus();
                return;
            }

            if (!method) {
                setFieldError(methodInput, "Choose a valid payment method.");
                methodInput.focus();
                return;
            }

            if (
                PAYMENT_METHODS_REQUIRING_REFERENCE.includes(method) &&
                !reference
            ) {
                setFieldError(
                    referenceInput,
                    "A reference number is required for GCash and bank transfers."
                );
                referenceInput.focus();
                return;
            }

            const originalLabel = editSubmitButton
                ? editSubmitButton.textContent
                : "";

            if (editSubmitButton) {
                editSubmitButton.disabled = true;
                editSubmitButton.textContent = "Saving...";
            }

            try {
                const response = await fetch(
                    `${PAYMENTS_API_URL}/${encodeURIComponent(editingPayment.id)}`,
                    {
                        method: "PUT",
                        headers: authHeaders({
                            "Content-Type": "application/json"
                        }),
                        body: JSON.stringify({
                            amount,
                            paymentDate: dateInput.value,
                            method,
                            referenceNumber: reference,
                            remarks: remarksInput.value.trim(),
                            version: editingPayment.version
                        })
                    }
                );

                if (response.status === 401) {
                    handleUnauthorized();
                    return;
                }

                const data = await response.json();

                if (
                    response.status === 409 &&
                    data.code === "VERSION_CONFLICT"
                ) {
                    if (editConflict) {
                        editConflict.textContent = data.message;
                        editConflict.hidden = false;
                    }

                    if (refreshPaymentRecord) {
                        refreshPaymentRecord.hidden = false;
                    }

                    return;
                }

                if (!response.ok || !data.success) {
                    throw new Error(
                        data.message || "Unable to update this payment."
                    );
                }

                closeEditPayment();
                await loadPayments();
                setFeedback(data.message || "Payment updated successfully.");

            } catch (error) {
                console.error("Update payment error:", error);
                setEditFormError(
                    error.message || "Unable to update this payment."
                );

            } finally {
                if (editSubmitButton) {
                    editSubmitButton.disabled = false;
                    editSubmitButton.textContent = originalLabel;
                }
            }
        });
    }

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

    async function openDetails(accountId) {
        detailsModal.classList.add("show");
        detailsSubtitle.textContent = "Loading...";
        detailsFacts.innerHTML = "";
        detailsBody.innerHTML = "";
        detailsError.hidden = true;
        detailsEmpty.hidden = true;

        try {
            const response = await fetch(
                `${PAYMENTS_API_URL}/${encodeURIComponent(accountId)}`,
                {
                    headers: authHeaders()
                }
            );

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
