/**
 * Trainee assessments — portal classes only, no dashboard.css dependency.
 */
(function initTraineeAssessments() {
    const user = window.EDTSP.session.requireRole("trainee");
    if (!user) return;

    const { api, ui, session } = window.EDTSP;
    const {
        setText,
        formatNumber,
        formatDate,
        statusBadge,
        state,
        element
    } = ui;

    session.bindLogout(document.getElementById("logoutButton"));

    const list = document.getElementById("assessmentList");

    const renderSummary = (assessments) => {
        const graded = assessments.filter(
            (item) =>
                item.status === "Graded" &&
                item.score !== null &&
                Number.isFinite(Number(item.score))
        );

        const pending = assessments.filter((item) => item.status === "Pending").length;
        const average = graded.length
            ? graded.reduce(
                  (sum, item) => sum + (Number(item.score) / item.totalScore) * 100,
                  0
              ) / graded.length
            : 0;

        setText("totalAssessments", String(assessments.length));
        setText("completedAssessments", String(graded.length));
        setText("pendingAssessments", String(pending));
        setText(
            "averageScore",
            graded.length ? `${formatNumber(average)}/100` : "—"
        );
    };

    const renderRecord = (assessment) => {
        const card = element("article", "assessment-item");

        const top = element("div", "assessment-item__top");
        const heading = element("div");

        const title = element("strong", null, assessment.assessmentTitle);
        const subject = element(
            "p",
            "assessment-item__subject",
            `${assessment.subject} · ${assessment.assessmentType || "Written"}`
        );

        heading.append(title, subject);
        top.append(heading, statusBadge(assessment.status));

        card.append(top);

        const dates = [];

        if (assessment.assessmentDate) {
            dates.push(`Assessed ${formatDate(assessment.assessmentDate)}`);
        }

        if (assessment.dueDate) {
            dates.push(`Due ${formatDate(assessment.dueDate)}`);
        }

        if (dates.length) {
            card.append(
                element("p", "assessment-item__meta", dates.join(" · "))
            );
        }

        if (
            assessment.status === "Graded" &&
            assessment.score !== null &&
            assessment.score !== undefined
        ) {
            const result = element("div", "assessment-item__result");
            result.append(
                element(
                    "span",
                    "assessment-item__score",
                    String(Number(assessment.score))
                ),
                element(
                    "span",
                    null,
                    `out of ${Number(assessment.totalScore)} points`
                )
            );
            card.append(result);
        }

        if (assessment.remarks) {
            card.append(
                element(
                    "p",
                    "assessment-item__remarks",
                    `Remarks: ${assessment.remarks}`
                )
            );
        }

        return card;
    };

    const load = async () => {
        if (!list) return;

        state(list, {
            title: "Loading assessments",
            message: "Fetching the assessments assigned to your trainee account."
        });

        try {
            const data = await api.get("/assessments/me");
            const assessments = data.assessments || [];

            renderSummary(assessments);
            list.replaceChildren();

            if (assessments.length === 0) {
                state(list, {
                    tone: "empty",
                    title: "No assessments yet",
                    message:
                        "You have no assigned assessments yet. They appear here as soon as your assessor assigns one."
                });
                return;
            }

            assessments.forEach((assessment) =>
                list.append(renderRecord(assessment))
            );
        } catch (error) {
            state(list, {
                tone: "error",
                title: "Could not load assessments",
                message: error.message,
                action: {
                    label: "Try again",
                    onClick: load
                }
            });
        }
    };

    load();
})();
