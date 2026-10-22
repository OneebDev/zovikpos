/* Render the real email templates with sample data without contacting an email provider. */
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const outputDir = path.resolve(
  process.argv[2] || path.join(__dirname, '../../email-previews/after'),
);
const rendered = [];

process.env.NODE_ENV = 'development';
process.env.SMTP_HOST = 'preview.invalid';
process.env.SMTP_PORT = '465';
process.env.SMTP_USER = 'preview@example.invalid';
process.env.SMTP_PASS = 'preview-only';
delete process.env.RESEND_API_KEY;

// Capture the message before transport. No SMTP or Resend request can be made.
nodemailer.createTransport = () => ({
  sendMail: async (message) => {
    rendered.push(message);
    return { messageId: `local-preview-${rendered.length}` };
  },
});

const emailService = require('../src/services/emailService');
const sampleOrder = {
  id: 1042,
  orderNumber: 'ORD-2026-01042',
  customerEmail: 'customer@example.invalid',
  user: { name: 'Amina Khan', email: 'customer@example.invalid' },
  tableNumber: 'Table 7',
  tableLabel: 'Table 7',
  status: 'PAID',
  subtotal: 2000,
  tax: 100,
  discount: 50,
  total: 2050,
  paymentStatus: 'PAID',
  paymentMethod: 'Easypaisa',
  paymentTxId: 'TX-PREVIEW-84051',
  createdAt: '2026-10-22T12:30:00.000Z',
  trackingToken: 'preview-tracking-token',
  etaPrediction: { adjustedEta: 18 },
  orderItems: [
    { nameSnapshot: 'Chicken Biryani', quantity: 2, priceSnapshot: 850, subtotal: 1700 },
    { nameSnapshot: 'Fresh Lime', quantity: 1, priceSnapshot: 300, subtotal: 300 },
  ],
};

const templates = [
  ['otp-verification', () => emailService.sendOTPEmail('customer@example.invalid', 'Amina Khan', '482916', 'session-preview-7')],
  ['order-confirmed', () => emailService.sendOrderPlacementEmail(sampleOrder)],
  ['payment-confirmed', () => emailService.sendPaymentConfirmedEmail(sampleOrder)],
  ['order-ready', () => emailService.sendOrderReadyEmail({ ...sampleOrder, status: 'READY' })],
  ['order-completed', () => emailService.sendOrderCompletionEmail({ ...sampleOrder, status: 'COMPLETED' })],
  ['order-cancelled', () => emailService.sendOrderCancellationEmail({ ...sampleOrder, status: 'CANCELLED' }, 'CANCELLED')],
];

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [name, render] of templates) {
    const beforeCount = rendered.length;
    await render();
    const message = rendered[beforeCount];
    if (!message?.html || !message?.text) {
      throw new Error(`Template ${name} did not produce both HTML and plain text.`);
    }
    fs.writeFileSync(path.join(outputDir, `${name}.html`), message.html, 'utf8');
    fs.writeFileSync(path.join(outputDir, `${name}.txt`), message.text, 'utf8');
  }
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(rendered.map(({ to, subject }) => ({ to, subject })), null, 2),
    'utf8',
  );
  console.log(`Rendered ${rendered.length} email previews to ${outputDir}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
