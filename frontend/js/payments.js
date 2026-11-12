/**
 * Trainee payments: fee ledger, submission form, own history.
 */
(function initTraineePayments() {
    const user = window.EDTSP.session.requireRole("trainee");
    if (!user) return;

    const { api, ui, session, upload } = window.EDTSP;
    const {
        setText,
        formatMoney,
        formatDate,
        statusBadge,
        state,
        fieldError,
        clearFieldErrors,
        setFormState,
        element
    } = ui;

    session.bindLogout(document.getElementById("logoutButton"));

    const form = document.getElementById("paymentForm");
    const amountInput = document.getElementById("paymentAmount");
    const dateInput = document.getElementById("paymentDate");
    const methodInput = document.getElementById("paymentMethod");
    const referenceInput = document.getElementById("paymentReference");
    const receiptInput = document.getElementById("paymentReceipt");
    const submitButton = document.getElementById("submitPayment");
    const formPanel = document.getElementById("paymentFormPanel");
    const historyBody = document.getElementById("paymentTableBody");
    const historyState = document.getElementById("paymentHistoryState");

    let currentBalance = 0;

    const renderStatus = (summary) => {
        setText("feeTotal", formatMoney(summary.totalFee || 0));
        setText("feePaid", formatMoney(summary.paid || 0));
        setText("feeBalance", formatMoney(summary.balance || 0));

        const percent = summary.totalFee
            ? Math.min(Math.round((summary.paid / summary.totalFee) * 100), 100)
            : 0;

        setText("feePercent", `${percent}%`);
        setText(
            "feeCaption",
            summary.totalFee
                ? `${formatMoney(summary.balance)} remains of the ${formatMoney(summary.totalFee)} training fee.`
                : "No training fee has been assigned to your account yet."
        );

        const meter = document.getElementById("feeMeter");
        if (meter) meter.style.width = `${percent}%`;

        const badgeHost = document.getElementById("feeStatus");
        if (badgeHost) {
            badgeHost.replaceWith(
                Object.assign(statusBadge(summary.status, summary.status), {
                    id: "feeStatus"
                })
            );
        }

        currentBalance = Number(summary.balance) || 0;

        if (formPanel) {
            if (!summary.totalFee) {
                formPanel.hidden = true;
                setText(
                    "paymentFormNote",
                    "A training fee must be assigned before you can submit a payment."
                );
            } else if (currentBalance <= 0) {
                formPanel.hidden = true;
                setText(
                    "paymentFormNote",
                    "Your training fee is fully paid. No further payment is needed."
                );
            } else {
                formPanel.hidden = false;
                setText("paymentFormNote", "");
            }
        }
    };

    const renderHistory = (payments) => {
        if (!historyBody) return;

        historyBody.replaceChildren();

        if (payments.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 7;
            state(cell, {
                tone: "empty",
                title: "No payments recorded",
                message:
                    "Payments you submit appear here with their verification status."
            });
            row.append(cell);
            historyBody.append(row);
            return;
        }

        payments.forEach((payment) => {
            const row = document.createElement("tr");

            const ref = element("td", "id", payment.paymentRef);
            const date = element("td", null, formatDate(payment.paymentDate));
            const description = element(
                "td",
                "name",
                payment.program ? payment.program.name : "Training payment"
            );
            const method = element("td", null, payment.method);
            const amount = element("td", "num", formatMoney(payment.amount));

            const statusCell = document.createElement("td");
            statusCell.append(statusBadge(payment.status));

            const receiptCell = element("td");

            if (payment.receiptUrl) {
                const link = document.createElement("a");
                link.className = "text-link";
                link.href = payment.receiptUrl;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.textContent = "Receipt";
                receiptCell.append(link);
            } else {
                receiptCell.textContent = payment.reference || "—";
            }

            if (payment.status === "Pending") {
                statusCell.title = "Awaiting verification";
            }

            if (payment.status === "Rejected" && payment.remarks) {
                statusCell.title = payment.remarks;

                const note = element("span", "sub", payment.remarks);
                statusCell.append(note);
            }

            row.append(ref, date, description, method, amount, statusCell, receiptCell);
            historyBody.append(row);
        });
    };

    const load = async () => {
        try {
            const data = await api.get("/trainee/payments");
            renderStatus(data.summary || {});
            renderHistory(data.payments || []);
        } catch (error) {
            if (historyState) {
                state(historyState, {
                    tone: "error",
                    title: "Could not load your payments",
                    message: error.message,
                    action: { label: "Try again", onClick: load }
                });
            }
        }
    };

    if (dateInput) {
        dateInput.max = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Manila"
        }).format(new Date());
    }

    if (upload && receiptInput) {
        upload.isConfigured().then((configured) => {
            if (configured) return;

            receiptInput.disabled = true;
            setText(
                "receiptHint",
                "Receipt uploads are not configured on this server. Submit the payment with a reference number instead."
            );
        });
    }

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearFieldErrors(form);
            setFormState(form, {});

            const amount = Number(amountInput.value);
            const paymentDate = dateInput.value;
            const method = methodInput.value;

            if (!Number.isFinite(amount) || amount <= 0) {
                return fieldError(amountInput, "Enter an amount greater than zero.");
            }

            if (amount > currentBalance) {
                return fieldError(
                    amountInput,
                    `Your remaining balance is ${formatMoney(currentBalance)}.`
                );
            }

            if (!paymentDate) {
                return fieldError(dateInput, "Choose the payment date.");
            }

            if (!method) {
                return fieldError(methodInput, "Choose a payment method.");
            }

            submitButton.disabled = true;
            submitButton.textContent = "Submitting…";

            let receipt = {};

            try {
                const file = receiptInput && receiptInput.files
                    ? receiptInput.files[0]
                    : null;

                if (file) {
                    setFormState(form, {
                        tone: "info",
                        message: "Uploading receipt…"
                    });

                    try {
                        receipt = await upload.uploadReceipt(file);
                    } catch (uploadError) {
                        if (uploadError.code !== "UPLOAD_NOT_CONFIGURED") {
                            setFormState(form, {
                                tone: "error",
                                message: `${uploadError.message} Submit again without the receipt, or try a smaller image.`
                            });
                            return;
                        }
                    }
                }

                const result = await api.post("/trainee/payments", {
                    amount,
                    paymentDate,
                    method,
                    reference: referenceInput ? referenceInput.value.trim() : "",
                    receiptUrl: receipt.url || "",
                    receiptKey: receipt.key || ""
                });

                form.reset();

                if (dateInput) {
                    dateInput.max = new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Manila"
                    }).format(new Date());
                }

                setFormState(form, {
                    tone: "success",
                    message: result.message
                });

                await load();
            } catch (error) {
                if (error.field === "amount") {
                    fieldError(amountInput, error.message);
                } else if (error.field === "paymentDate") {
                    fieldError(dateInput, error.message);
                } else if (error.field === "method") {
                    fieldError(methodInput, error.message);
                } else {
                    setFormState(form, { tone: "error", message: error.message });
                }
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = "Submit payment";
            }
        });
    }

    load();
})();
