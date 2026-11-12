/**
 * Admin payments: ledger, verification queue, record-payment modal.
 */
(function initAdminPayments() {
    const user = window.EDTSP.session.requireRole("admin");
    if (!user) return;

    const { api, ui } = window.EDTSP;
    const {
        setText,
        formatMoney,
        formatDate,
        statusBadge,
        state,
        element,
        debounce,
        pager,
        openModal,
        closeModal,
        fieldError,
        clearFieldErrors,
        setFormState
    } = ui;

    const body = document.getElementById("paymentTableBody");
    const pagerHost = document.getElementById("paymentPager");
    const listState = document.getElementById("paymentState");
    const searchInput = document.getElementById("paymentSearch");
    const statusFilter = document.getElementById("paymentStatusFilter");

    const recordModal = document.getElementById("paymentModal");
    const recordForm = document.getElementById("paymentForm");
    const traineeSelect = document.getElementById("paymentTrainee");
    const amountInput = document.getElementById("paymentAmount");
    const dateInput = document.getElementById("paymentDate");
    const methodInput = document.getElementById("paymentMethod");
    const referenceInput = document.getElementById("paymentReference");
    const remarksInput = document.getElementById("paymentRemarks");
    const verifiedInput = document.getElementById("paymentVerified");
    const traineeHelp = document.getElementById("paymentTraineeHelp");

    const rejectModal = document.getElementById("rejectModal");
    const rejectForm = document.getElementById("rejectForm");
    const rejectReason = document.getElementById("rejectReason");

    const filters = { page: 1, search: "", status: "all" };
    let rejecting = null;
    let traineesLoaded = false;

    const renderSummary = (summary) => {
        if (!summary) return;

        setText("ledgerCollected", formatMoney(summary.collected || 0));
        setText("ledgerOutstanding", formatMoney(summary.outstanding || 0));
        setText("ledgerPending", String(summary.pending ?? 0));
        setText("ledgerCount", String(summary.count ?? 0));
    };

    const renderRows = (payments) => {
        body.replaceChildren();

        if (payments.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 9;

            const filtered = filters.search || filters.status !== "all";

            state(cell, {
                tone: "empty",
                title: filtered ? "Nothing matches these filters" : "No payments recorded",
                message: filtered
                    ? "Clear the search or status filter to see every payment."
                    : "Trainee submissions and recorded payments appear here."
            });

            row.append(cell);
            body.append(row);
            return;
        }

        payments.forEach((payment) => {
            const row = document.createElement("tr");

            row.append(
                element("td", "id", payment.paymentRef || "—"),
                element(
                    "td",
                    "name",
                    payment.user
                        ? `${payment.user.firstName} ${payment.user.lastName}`
                        : "Removed account"
                ),
                element("td", null, payment.program ? payment.program.name : "—"),
                element("td", "num", formatMoney(payment.amount)),
                element("td", null, formatDate(payment.paymentDate)),
                element("td", null, payment.method),
                element("td", "id", payment.reference || "—")
            );

            const receipt = element("td");

            if (payment.receiptUrl) {
                const link = document.createElement("a");
                link.className = "text-link";
                link.href = payment.receiptUrl;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.textContent = "Receipt";
                receipt.append(link);
            } else {
                receipt.textContent = "—";
            }

            row.append(receipt);

            const status = document.createElement("td");
            status.append(statusBadge(payment.status));

            if (payment.remarks) {
                status.append(element("span", "sub", payment.remarks));
            }

            row.append(status);

            const actions = document.createElement("td");

            if (payment.status === "Pending") {
                const verifyButton = element("button", "row-action", "Verify");
                verifyButton.type = "button";
                verifyButton.addEventListener("click", () => verify(payment));

                const reject = element("button", "row-action", "Reject");
                reject.type = "button";
                reject.addEventListener("click", () => openReject(payment));

                actions.append(verifyButton, reject);
            } else {
                actions.textContent = payment.verifiedAt
                    ? `Decided ${formatDate(payment.verifiedAt)}`
                    : "—";
            }

            row.append(actions);
            body.append(row);
        });
    };

    const load = async () => {
        if (listState) {
            state(listState, {
                title: "Loading payments",
                message: "Reading payment records and their verification status."
            });
            listState.hidden = false;
        }

        if (body) body.hidden = true;

        const params = new URLSearchParams({ page: String(filters.page), limit: "25" });

        if (filters.search) params.set("search", filters.search);
        if (filters.status !== "all") params.set("status", filters.status);

        try {
            const data = await api.get(`/admin/payments?${params.toString()}`);

            renderSummary(data.summary);

            if (listState) {
                listState.hidden = true;
                listState.replaceChildren();
            }

            if (body) body.hidden = false;

            renderRows(data.payments || []);
            pager(pagerHost, data, (page) => {
                filters.page = page;
                load();
            });
        } catch (error) {
            if (body) body.hidden = true;

            if (listState) {
                listState.hidden = false;
                state(listState, {
                    tone: "error",
                    title: "Could not load payments",
                    message: error.message,
                    action: { label: "Try again", onClick: load }
                });
            }
        }
    };

    const verify = async (payment) => {
        try {
            await api.put(`/admin/payments/${payment._id}/verify`, {});
            await load();
        } catch (error) {
            if (listState) {
                listState.hidden = false;
                state(listState, {
                    tone: "error",
                    title: "Payment could not be verified",
                    message: error.message
                });
            }
        }
    };

    const openReject = (payment) => {
        rejecting = payment;

        clearFieldErrors(rejectForm);
        setFormState(rejectForm, {});
        rejectReason.value = "";

        setText(
            "rejectRef",
            `${payment.paymentRef} · ${payment.user ? `${payment.user.firstName} ${payment.user.lastName}` : "Removed account"} · ${formatMoney(payment.amount)}`
        );

        openModal(rejectModal, { initialFocus: rejectReason });
    };

    const loadTrainees = async () => {
        if (traineesLoaded || !traineeSelect) return;

        try {
            const data = await api.get("/admin/trainees?limit=100");
            traineeSelect.replaceChildren();

            const blank = document.createElement("option");
            blank.value = "";
            blank.textContent = "Select a trainee";
            traineeSelect.append(blank);

            (data.trainees || []).forEach((trainee) => {
                const option = document.createElement("option");
                option.value = trainee._id;
                option.textContent = `${trainee.name} · ${trainee.programName || "No program"}`;
                option.dataset.balance = String(trainee.balance);
                traineeSelect.append(option);
            });

            traineesLoaded = true;
        } catch (error) {
            if (traineeHelp) traineeHelp.textContent = error.message;
        }
    };

    if (searchInput) {
        searchInput.addEventListener(
            "input",
            debounce(() => {
                filters.search = searchInput.value.trim();
                filters.page = 1;
                load();
            }, 300)
        );
    }

    if (statusFilter) {
        statusFilter.addEventListener("change", () => {
            filters.status = statusFilter.value;
            filters.page = 1;
            load();
        });
    }

    if (traineeSelect) {
        traineeSelect.addEventListener("change", () => {
            const option = traineeSelect.selectedOptions[0];

            if (option && option.dataset.balance && traineeHelp) {
                traineeHelp.textContent = `Remaining balance: ${formatMoney(
                    option.dataset.balance
                )}`;
            } else if (traineeHelp) {
                traineeHelp.textContent = "";
            }
        });
    }

    document.querySelectorAll("[data-close-payment]").forEach((button) => {
        button.addEventListener("click", () => closeModal(recordModal));
    });

    document.querySelectorAll("[data-close-reject]").forEach((button) => {
        button.addEventListener("click", () => closeModal(rejectModal));
    });

    const recordButton = document.getElementById("recordPaymentBtn");

    if (recordButton) {
        recordButton.addEventListener("click", async () => {
            recordForm.reset();
            clearFieldErrors(recordForm);
            setFormState(recordForm, {});

            if (dateInput) {
                dateInput.max = new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Manila"
                }).format(new Date());
            }

            openModal(recordModal, { initialFocus: traineeSelect });
            await loadTrainees();
        });
    }

    if (recordForm) {
        recordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearFieldErrors(recordForm);
            setFormState(recordForm, {});

            const amount = Number(amountInput.value);

            if (!traineeSelect.value) {
                return fieldError(traineeSelect, "Choose the trainee.");
            }

            if (!Number.isFinite(amount) || amount <= 0) {
                return fieldError(amountInput, "Enter an amount greater than zero.");
            }

            if (!dateInput.value) {
                return fieldError(dateInput, "Choose the payment date.");
            }

            if (!methodInput.value) {
                return fieldError(methodInput, "Choose a payment method.");
            }

            const submit = recordForm.querySelector('button[type="submit"]');
            submit.disabled = true;
            submit.textContent = "Recording…";

            try {
                await api.post("/admin/payments", {
                    userId: traineeSelect.value,
                    amount,
                    paymentDate: dateInput.value,
                    method: methodInput.value,
                    reference: referenceInput.value.trim(),
                    remarks: remarksInput.value.trim(),
                    status: verifiedInput && verifiedInput.checked ? "Verified" : "Pending"
                });

                closeModal(recordModal);
                await load();
            } catch (error) {
                if (error.field === "amount") {
                    fieldError(amountInput, error.message);
                } else if (error.field === "userId") {
                    fieldError(traineeSelect, error.message);
                } else {
                    setFormState(recordForm, { tone: "error", message: error.message });
                }
            } finally {
                submit.disabled = false;
                submit.textContent = "Record payment";
            }
        });
    }

    if (rejectForm) {
        rejectForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearFieldErrors(rejectForm);
            setFormState(rejectForm, {});

            if (!rejecting) return;

            const reason = rejectReason.value.trim();

            if (!reason) {
                return fieldError(rejectReason, "Give a short reason for the trainee.");
            }

            const submit = rejectForm.querySelector('button[type="submit"]');
            submit.disabled = true;
            submit.textContent = "Rejecting…";

            try {
                await api.put(`/admin/payments/${rejecting._id}/reject`, {
                    remarks: reason
                });

                closeModal(rejectModal);
                await load();
            } catch (error) {
                if (error.field === "remarks") {
                    fieldError(rejectReason, error.message);
                } else {
                    setFormState(rejectForm, { tone: "error", message: error.message });
                }
            } finally {
                submit.disabled = false;
                submit.textContent = "Reject payment";
            }
        });
    }

    load();
})();
