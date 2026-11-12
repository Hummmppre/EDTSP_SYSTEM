/**
 * Trainee dashboard — every figure comes from the API.
 */
(function initTraineeDashboard() {
    const user = window.EDTSP.session.requireRole("trainee");
    if (!user) return;

    const { api, ui, session } = window.EDTSP;
    const { setText, formatMoney, formatNumber, formatDate, state, statusBadge } = ui;

    window.EDTSP.session.bindLogout(document.getElementById("logoutButton"));

    const progressList = document.getElementById("progressList");
    const careList = document.getElementById("careList");

    const loadProfile = async () => {
        const data = await api.get("/trainee/me");
        const profile = data.profile || {};
        const fullName = `${data.user.firstName} ${data.user.lastName}`.trim();

        session.paintIdentity(data.user);
        setText("profileName", fullName);
        setText("profileEmail", data.user.email);
        setText("profileProgram", profile.programName || "Not assigned");
        setText("programValue", profile.programName || "Pending");
        setText(
            "programNote",
            profile.enrollmentStatus
                ? `${profile.enrollmentStatus} enrolment`
                : "No program assigned yet"
        );

        const accountBadge = document.getElementById("profileAccountStatus");
        if (accountBadge) {
            accountBadge.replaceWith(
                Object.assign(statusBadge(data.user.status), {
                    id: "profileAccountStatus"
                })
            );
        }

        return { user: data.user, profile };
    };

    const loadPayments = async () => {
        const data = await api.get("/trainee/payments");
        const summary = data.summary || {};

        setText("balanceValue", formatMoney(summary.balance || 0));
        setText(
            "balanceNote",
            summary.totalFee
                ? `Remaining of ${formatMoney(summary.totalFee)}`
                : "No fee assigned yet"
        );

        setText("feeTotal", formatMoney(summary.totalFee || 0));
        setText("feePaid", formatMoney(summary.paid || 0));
        setText("feeBalance", formatMoney(summary.balance || 0));

        const percent = summary.totalFee
            ? Math.min(Math.round((summary.paid / summary.totalFee) * 100), 100)
            : 0;

        setText("feePercent", String(percent));
        setText(
            "feeCaption",
            summary.totalFee
                ? `${formatMoney(summary.balance)} remains of the ${formatMoney(summary.totalFee)} fee.`
                : "No training fee has been assigned to your account yet."
        );

        const meter = document.getElementById("feeMeter");
        if (meter) meter.style.width = `${percent}%`;

        const feeState = document.getElementById("feeStatus");
        if (feeState) {
            feeState.replaceWith(
                Object.assign(statusBadge(summary.status, summary.status), {
                    id: "feeStatus"
                })
            );
        }

        return summary;
    };

    const loadAssessments = async () => {
        const data = await api.get("/assessments/me");
        const assessments = data.assessments || [];

        const graded = assessments.filter(
            (item) =>
                item.status === "Graded" &&
                item.score !== null &&
                Number.isFinite(Number(item.score))
        );

        const average = graded.length
            ? graded.reduce(
                  (sum, item) => sum + (Number(item.score) / item.totalScore) * 100,
                  0
              ) / graded.length
            : null;

        setText("averageValue", average === null ? "—" : `${formatNumber(average)}/100`);
        setText(
            "averageNote",
            graded.length
                ? `Across ${graded.length} graded assessment${graded.length === 1 ? "" : "s"}`
                : "No graded assessments yet"
        );

        // Per-subject progress instead of invented module meters.
        const bySubject = new Map();

        assessments.forEach((item) => {
            const entry = bySubject.get(item.subject) || {
                subject: item.subject,
                scores: [],
                pending: 0
            };

            if (item.status === "Graded" && item.score !== null) {
                entry.scores.push((Number(item.score) / item.totalScore) * 100);
            } else {
                entry.pending += 1;
            }

            bySubject.set(item.subject, entry);
        });

        if (progressList) {
            progressList.replaceChildren();

            if (bySubject.size === 0) {
                state(progressList, {
                    tone: "empty",
                    title: "No assessment records yet",
                    message:
                        "Progress appears here once your assessor assigns your first assessment.",
                    action: {
                        label: "Open assessments",
                        onClick: () => {
                            window.location.href = "assessments.html";
                        }
                    }
                });
            } else {
                bySubject.forEach((entry) => {
                    const percent = entry.scores.length
                        ? Math.round(
                              entry.scores.reduce((sum, value) => sum + value, 0) /
                                  entry.scores.length
                          )
                        : 0;

                    const meter = document.createElement("div");
                    meter.className = "meter";

                    const row = document.createElement("div");
                    row.className = "meter__row";

                    const label = document.createElement("span");
                    label.textContent = entry.subject;

                    const value = document.createElement("span");
                    value.className = "meter__value";
                    value.textContent = entry.scores.length
                        ? `${percent}%`
                        : `${entry.pending} pending`;

                    row.append(label, value);

                    const track = document.createElement("div");
                    track.className = "meter__track";

                    const fill = document.createElement("span");
                    fill.className = "meter__fill";
                    fill.style.width = `${percent}%`;
                    track.append(fill);

                    meter.append(row, track);
                    progressList.append(meter);
                });
            }

            const meta = document.getElementById("progressMeta");
            if (meta) {
                meta.textContent = `${bySubject.size} subject${bySubject.size === 1 ? "" : "s"}`;
            }
        }

        return assessments;
    };

    const loadCows = async () => {
        const [cowsData, activitiesData] = await Promise.all([
            api.get("/trainee/cows"),
            api.get("/trainee/activities")
        ]);

        const cows = cowsData.cows || [];
        const activities = activitiesData.activities || [];

        const todayKey = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Manila"
        }).format(new Date());

        const todaysActivities = activities.filter((activity) => {
            if (!activity.scheduledAt) return false;
            return (
                new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Manila"
                }).format(new Date(activity.scheduledAt)) === todayKey
            );
        });

        const completed = todaysActivities.filter(
            (activity) => activity.status === "Completed"
        ).length;

        setText(
            "careValue",
            todaysActivities.length ? `${completed}/${todaysActivities.length}` : "—"
        );
        setText(
            "careNote",
            todaysActivities.length
                ? "Care tasks completed today"
                : "No tasks scheduled today"
        );

        if (careList) {
            careList.replaceChildren();

            if (cows.length === 0 && activities.length === 0) {
                state(careList, {
                    tone: "empty",
                    title: "No animals assigned to you",
                    message:
                        "Your care schedule appears once an administrator assigns animals to your account."
                });
            } else {
                const upcoming = activities.slice(0, 4);

                if (upcoming.length === 0) {
                    state(careList, {
                        tone: "empty",
                        title: "No activities scheduled",
                        message: "New care tasks will appear in this panel."
                    });
                }

                upcoming.forEach((activity) => {
                    const item = document.createElement("div");
                    item.className = "care";

                    const text = document.createElement("div");
                    const title = document.createElement("strong");
                    title.textContent = `${activity.type} · ${activity.cow.cowId}`;

                    const detail = document.createElement("p");
                    detail.textContent = `${activity.description} — ${formatDate(
                        activity.scheduledAt
                    )}`;

                    text.append(title, detail);

                    const badge = statusBadge(activity.status);
                    item.append(text, badge);
                    careList.append(item);
                });
            }
        }

        return { cows, activities };
    };

    const withOwnState = async (loader, containerId, label) => {
        try {
            return await loader();
        } catch (error) {
            const container = document.getElementById(containerId);

            if (container) {
                state(container, {
                    tone: "error",
                    title: `Could not load ${label}`,
                    message: error.message,
                    action: {
                        label: "Try again",
                        onClick: () => window.location.reload()
                    }
                });
            }

            return null;
        }
    };

    (async () => {
        await withOwnState(loadProfile, "profileFacts", "your profile");
        await withOwnState(loadPayments, "feePanel", "your fee record");
        await withOwnState(loadAssessments, "progressPanelBody", "assessment progress");
        await withOwnState(loadCows, "carePanelBody", "animal care");
    })();
})();
