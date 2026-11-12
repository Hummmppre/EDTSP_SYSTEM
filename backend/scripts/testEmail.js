const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { sendEmail } = require("../lib/mailer");

const to = process.argv[2] || (process.env.MAIL_FROM || "").match(/<([^>]+)>/)?.[1];

const main = async () => {
    if (!to) {
        console.error("Usage: node scripts/testEmail.js [recipient@example.com]");
        process.exit(1);
    }

    const result = await sendEmail({
        to,
        subject: "EDTSP email test",
        text: "This is a test message from the Esperon Dairy Training Student Portal. Brevo is configured correctly.",
        html: "<p>This is a test message from the Esperon Dairy Training Student Portal. Brevo is configured correctly.</p>"
    });

    if (!result.sent) {
        console.error(`Test email was not sent: ${result.error}`);
        process.exit(1);
    }

    console.log(`Test email sent to ${to}. Check the inbox and spam folder.`);
};

main();
