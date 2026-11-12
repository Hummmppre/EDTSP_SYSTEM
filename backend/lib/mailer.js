const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 8000;

function parseSender(raw) {
    const value = (raw || "").trim();
    if (!value) return null;

    const bracketed = value.match(/^(.*)<([^>]+)>\s*$/);
    if (bracketed) {
        const email = bracketed[2].trim();
        if (!email) return null;
        return {
            email,
            name: bracketed[1].trim().replace(/^"|"$/g, "")
        };
    }

    return { email: value, name: "" };
}

// MAIL_FROM takes a full "Name <email>" value. The split MAIL_FROM_EMAIL /
// MAIL_FROM_NAME pair is still honoured for deployments that prefer it.
function getSender() {
    const combined = parseSender(process.env.MAIL_FROM);
    if (combined) return combined;

    const email = (process.env.MAIL_FROM_EMAIL || "").trim();
    if (!email) return null;

    return {
        email,
        name: (process.env.MAIL_FROM_NAME || "").trim()
    };
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function sendEmail({ to, subject, text, html, replyTo }) {
    if (!to) {
        console.warn(`[mailer] No recipient for "${subject}" — skipped.`);
        return { sent: false, error: "Missing recipient." };
    }

    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
        console.warn(`[mailer] BREVO_API_KEY is not set — skipped "${subject}" to ${to}.`);
        return { sent: false, error: "BREVO_API_KEY is not set." };
    }

    const sender = getSender();

    if (!sender) {
        console.warn(`[mailer] MAIL_FROM is not set — skipped "${subject}" to ${to}.`);
        return { sent: false, error: "MAIL_FROM is not set." };
    }

    const payload = {
        sender,
        to: [{ email: to }],
        subject,
        textContent: text
    };

    if (html) payload.htmlContent = html;
    if (replyTo) payload.replyTo = { email: replyTo };

    try {
        const response = await fetch(BREVO_ENDPOINT, {
            method: "POST",
            headers: {
                "api-key": apiKey,
                "content-type": "application/json",
                accept: "application/json"
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            const body = await response.text();
            const error = `Brevo responded ${response.status}: ${body.slice(0, 500)}`;
            console.error(`[mailer] Failed to send "${subject}" to ${to}. ${error}`);
            return { sent: false, error };
        }

        console.log(`[mailer] Sent "${subject}" to ${to}.`);
        return { sent: true };
    } catch (error) {
        const reason = error.name === "TimeoutError"
            ? `Brevo request timed out after ${REQUEST_TIMEOUT_MS}ms.`
            : error.message;

        console.error(`[mailer] Failed to send "${subject}" to ${to}: ${reason}`);
        return { sent: false, error: reason };
    }
}

function buildDecisionContent({ name, program, batch, decision, publicNote }) {
    const approved = decision === "Approved";
    const firstName = (name || "").trim().split(/\s+/)[0] || "Trainee";
    const programName = program || "your chosen program";
    const batchLabel = batch || "";

    const subject = approved
        ? `Your EDTSP application was approved — ${programName}`
        : `Your EDTSP application was not approved — ${programName}`;

    const nextStep = approved
        ? "Next step: log in to the portal to pay the training fee, then wait for schedule details from the training office."
        : "If you would like to apply again, you can submit a new application in the portal.";

    const lines = [
        `Hello ${firstName},`,
        "",
        approved
            ? `Your application for ${programName}${batchLabel ? ` (${batchLabel})` : ""} has been approved.`
            : `Your application for ${programName}${batchLabel ? ` (${batchLabel})` : ""} was not approved.`,
        ""
    ];

    if (publicNote) {
        lines.push("Message from the training office:", publicNote, "");
    }

    lines.push(nextStep, "", "Esperon Dairy Training");

    const text = lines.join("\n");

    const html = `
        <div style="font-family: Georgia, 'Times New Roman', serif; color: #222; line-height: 1.6;">
            <p>Hello ${escapeHtml(firstName)},</p>
            <p>${escapeHtml(approved
                ? `Your application for ${programName}${batchLabel ? ` (${batchLabel})` : ""} has been approved.`
                : `Your application for ${programName}${batchLabel ? ` (${batchLabel})` : ""} was not approved.`)}</p>
            ${publicNote
                ? `<p><strong>Message from the training office:</strong><br>${escapeHtml(publicNote).replace(/\n/g, "<br>")}</p>`
                : ""}
            <p>${escapeHtml(nextStep)}</p>
            <p>Esperon Dairy Training</p>
        </div>
    `.trim();

    return { subject, text, html };
}

// Never throws: callers get { sent, error } and decide what to show the user.
async function sendApplicationDecision({ to, name, program, batch, decision, publicNote, replyTo }) {
    const { subject, text, html } = buildDecisionContent({
        name,
        program,
        batch,
        decision,
        publicNote
    });

    return sendEmail({ to, subject, text, html, replyTo });
}

function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function firstNameOf(name) {
    return (name || "").trim().split(/\s+/)[0] || "Trainee";
}

// Shared ledger-tone shell: heading, a few facts, one message, one next step.
function buildMessageContent({ heading, facts = [], message, nextStep, signoff }) {
    const lines = [heading, ""];

    facts.forEach(fact => lines.push(`${fact.label}: ${fact.value}`));
    if (facts.length) lines.push("");
    if (message) lines.push(message, "");
    if (nextStep) lines.push(nextStep, "");
    lines.push(signoff || "Esperon Dairy Training");

    const factRows = facts
        .map(fact => `
                <div style="display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px solid #e3dbc9;">
                    <span style="color: #69715f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(fact.label)}</span>
                    <span style="text-align: right;">${escapeHtml(fact.value)}</span>
                </div>`)
        .join("");

    const html = `
        <div style="font-family: Georgia, 'Times New Roman', serif; color: #161c14; line-height: 1.6; max-width: 560px;">
            <p>${escapeHtml(heading)}</p>
            ${factRows ? `<div style="margin: 18px 0 20px; padding: 4px 16px; background: #fffdf7; border: 1px solid #d9d1be; border-radius: 6px;">${factRows}</div>` : ""}
            ${message ? `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>` : ""}
            ${nextStep ? `<p>${escapeHtml(nextStep)}</p>` : ""}
            <p style="margin-top: 24px;">${escapeHtml(signoff || "Esperon Dairy Training")}</p>
        </div>
    `.trim();

    return { text: lines.join("\n"), html };
}

// Account created (self signup or an administrator provisioning the account).
async function sendWelcomeEmail({ to, name, role = "trainee", replyTo }) {
    const firstName = firstNameOf(name);
    const isAdmin = role === "admin";

    const { text, html } = buildMessageContent({
        heading: `Hello ${firstName},`,
        facts: [
            { label: "Account", value: isAdmin ? "Administrator" : "Trainee" },
            { label: "Email", value: to }
        ],
        message: isAdmin
            ? "Your administrator account for the Esperon Dairy Training Student Portal is ready."
            : "Your trainee account for the Esperon Dairy Training Student Portal is ready. Sign in to submit a training application and follow your enrolment.",
        nextStep: isAdmin
            ? "Next step: sign in with your email and the password set for this account."
            : "Next step: sign in, open \"Apply for training\", and submit your application for review."
    });

    return sendEmail({
        to,
        subject: `Your EDTSP ${isAdmin ? "administrator" : "trainee"} account is ready`,
        text,
        html,
        replyTo
    });
}

// Application submitted: sets the expectation that a decision arrives by email.
async function sendApplicationReceived({ to, name, program, batch, submittedAt, replyTo }) {
    const firstName = firstNameOf(name);

    const { text, html } = buildMessageContent({
        heading: `Hello ${firstName},`,
        facts: [
            { label: "Program", value: program || "" },
            { label: "Batch", value: batch || "" },
            { label: "Submitted", value: formatDate(submittedAt) }
        ].filter(fact => fact.value),
        message: "Your training application has been received and is now under review by the training office.",
        nextStep: "We will email you at this address once a decision is made. You can follow the status on your dashboard and withdraw the application while it is under review."
    });

    return sendEmail({
        to,
        subject: "Your EDTSP training application was received",
        text,
        html,
        replyTo
    });
}

// Assessment assigned to a trainee.
async function sendAssessmentAssigned({ to, name, assessmentTitle, subject, assessmentDate, totalScore, replyTo }) {
    const firstName = firstNameOf(name);

    const { text, html } = buildMessageContent({
        heading: `Hello ${firstName},`,
        facts: [
            { label: "Assessment", value: assessmentTitle || "" },
            { label: "Subject", value: subject || "" },
            { label: "Date", value: formatDate(assessmentDate) },
            { label: "Total score", value: totalScore !== undefined ? String(totalScore) : "" }
        ].filter(fact => fact.value),
        message: "A new assessment has been assigned to your trainee account.",
        nextStep: "Next step: sign in to the portal and open Assessments to see the details."
    });

    return sendEmail({
        to,
        subject: `New EDTSP assessment — ${assessmentTitle}`,
        text,
        html,
        replyTo
    });
}

// Assessment graded: the score is now visible in the portal.
async function sendAssessmentGraded({ to, name, assessmentTitle, subject, score, totalScore, remarks, replyTo }) {
    const firstName = firstNameOf(name);

    const { text, html } = buildMessageContent({
        heading: `Hello ${firstName},`,
        facts: [
            { label: "Assessment", value: assessmentTitle || "" },
            { label: "Subject", value: subject || "" },
            {
                label: "Score",
                value: score !== undefined && score !== null
                    ? `${score} / ${totalScore}`
                    : ""
            }
        ].filter(fact => fact.value),
        message: remarks ? `Remarks from your assessor:\n${remarks}` : "Your assessment has been graded.",
        nextStep: "Next step: sign in to the portal and open Assessments for the full record."
    });

    return sendEmail({
        to,
        subject: `EDTSP assessment graded — ${assessmentTitle}`,
        text,
        html,
        replyTo
    });
}

module.exports = {
    sendEmail,
    sendApplicationDecision,
    sendApplicationReceived,
    sendWelcomeEmail,
    sendAssessmentAssigned,
    sendAssessmentGraded
};
