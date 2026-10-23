require('dotenv').config();
const nodemailer = require('nodemailer');

const recipient = process.argv[2];
if (!recipient) {
  console.error('Usage: node scripts/send-test-email.js recipient@example.com');
  process.exit(1);
}

const port = Number(process.env.SMTP_PORT) || 465;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

if (!user || !pass) {
  console.error('SMTP_USER and SMTP_PASS must be configured.');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port,
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
  auth: { user, pass },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

const from = process.env.EMAIL_FROM || 'Zovik POS <support@zovikpos.store>';

transporter.verify()
  .then(() => transporter.sendMail({
    from,
    replyTo: 'support@zovikpos.store',
    to: recipient,
    subject: 'Zovik POS SMTP test',
    text: 'This is a Zovik POS Hostinger SMTP test email.',
  }))
  .then(() => console.log(`Test email sent to ${recipient}.`))
  .catch((error) => {
    console.error(`SMTP test failed: ${error.message}`);
    process.exitCode = 1;
  });
