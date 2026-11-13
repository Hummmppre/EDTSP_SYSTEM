const MY_PAYMENTS_API_URL = "http://localhost:5000/api/trainee/payments";

document.addEventListener("DOMContentLoaded", () => {
    const historyBody = document.getElementById("paymentHistoryBody");
    const historyCount = document.getElementById("paymentHistoryCount");
    const emptyState = document.getElementById("paymentEmptyState");
    const notice = document.getElementById("paymentNotice");

    if (!historyBody) return;

    const money = value => {
        const amount = Number(value || 0);
        const hasCents = Math.round(amount * 100) % 100 !== 0;

        return `₱${amount.toLocaleString("en-PH", {
            minimumFractionDigits: hasCents ? 2 : 0,
            maximumFractionDigits: 2
        })}`;
    };

    const formatDate = value => {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric"
        });
    };

    const setText = (id, value) => {
        const element = document.getElementById(id);

        if (element) element.textContent = value;
    };

    function setNotice(message) {
        if (!notice) return;

        notice.textContent = message;
        notice.hidden = !message;
    }

    function handleUnauthorized() {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
        window.location.href = "../login.html";
    }

    function renderSummary(summary, hasAccounts) {
        setText("traineeTotalFee", money(summary.totalFee));
        setText("traineeAmountPaid", money(summary.totalPaid));
        setText("traineeBalance", money(summary.balance));
        setText("traineeStatus", hasAccounts ? summary.status : "—");
        setText(
            "traineeStatusNote",
            hasAccounts ? statusNote(summary.status) : "Awaiting your training account"
        );

        setText("factTotalFee", money(summary.totalFee));
        setText("factPaid", money(summary.totalPaid));
        setText("factBalance", money(summary.balance));

        const percent = summary.totalFee > 0
            ? Math.min(100, Math.round((summary.totalPaid / summary.totalFee) * 100))
            : (hasAccounts ? 100 : 0);

        setText("feeProgressPercent", String(percent));

        const fill = document.getElementById("feeProgressFill");

        if (fill) fill.style.width = `${percent}%`;

        setText(
            "feeProgressNote",
            hasAccounts
                ? `${money(summary.totalPaid)} of ${money(summary.totalFee)} received.`
                : "No training fee account yet."
        );

        setText("factNextStep", nextStepFor(summary, hasAccounts));
    }

    function statusNote(status) {
        if (status === "Fully Paid") return "Payment complete";
        if (status === "Partial") return "Payment still required";
        return "Payment required";
    }

    function nextStepFor(summary, hasAccounts) {
        if (!hasAccounts) {
            return "Your fee appears once your application is approved.";
        }

        if (summary.status === "Fully Paid") {
            return "Your training fee is settled.";
        }

        if (summary.status === "Partial") {
            return `Settle the remaining ${money(summary.balance)} with the training office.`;
        }

        return "Pay the training fee with the training office to begin.";
    }

    function renderHistory(payments) {
        historyBody.innerHTML = "";

        if (historyCount) {
            const count = payments.length;

            historyCount.textContent = `${count} record${count === 1 ? "" : "s"}`;
        }

        if (!payments.length) {
            if (emptyState) emptyState.hidden = false;

            return;
        }

        if (emptyState) emptyState.hidden = true;

        payments.forEach(payment => {
            const row = document.createElement("tr");
            const values = [
                { text: payment.receiptNumber, className: "id" },
                { text: formatDate(payment.paymentDate) },
                { text: payment.programName || "—" },
                { text: payment.remarks || "—" },
                { text: payment.method },
                { text: money(payment.amount), className: "num" }
            ];

            values.forEach(({ text, className }) => {
                const cell = document.createElement("td");

                cell.textContent = text;

                if (className) cell.className = className;

                row.appendChild(cell);
            });

            const statusCell = document.createElement("td");
            const badge = document.createElement("span");

            badge.className = "status-badge completed";
            badge.textContent = "Recorded";
            statusCell.appendChild(badge);
            row.appendChild(statusCell);

            historyBody.appendChild(row);
        });
    }

    function setPanelsVisible(visible) {
        ["fee-title", "history-title"].forEach(id => {
            const heading = document.getElementById(id);
            const panel = heading ? heading.closest("section") : null;

            if (panel) panel.hidden = !visible;
        });
    }

    async function loadPayments() {
        try {
            const response = await fetch(MY_PAYMENTS_API_URL, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("edtspToken") || ""}`
                }
            });

            if (response.status === 401) {
                handleUnauthorized();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to load your payment records.");
            }

            const hasAccounts = Boolean(data.hasAccounts);

            renderSummary(data.summary || {}, hasAccounts);
            renderHistory(data.payments || []);
            setPanelsVisible(hasAccounts);

            setNotice(
                hasAccounts
                    ? ""
                    : "No training fee account yet. Your fee appears here once an application is approved."
            );

        } catch (error) {
            console.error("Trainee payment load error:", error);

            renderSummary({}, false);
            renderHistory([]);
            setPanelsVisible(false);
            setNotice(
                error.message || "Unable to load your payment records. Please try again."
            );
        }
    }

    loadPayments();
});
