const nodemailer = require('nodemailer');
const exceptionLogger = require('../utils/exceptionLogger');
const { formatTableLabel } = require('../utils/tableLabel');
const {
  bodyParagraph,
  buildPlainText,
  divider,
  emailLayout,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  greeting,
  headline,
  itemizedOrderTable,
  notice,
  primaryButton,
  summaryBox,
  tokenBox,
  totalsTable,
} = require('./emailTemplateHelpers');

const SMTP_DEFAULT_HOST = 'smtp.hostinger.com';
const SMTP_DEFAULT_PORT = 465;
const SMTP_DEFAULT_FROM = 'Zovik POS <support@zovikpos.store>';
const SMTP_REPLY_TO = 'support@zovikpos.store';
const SMTP_TIMEOUT_MS = 10000;

const getSmtpConfig = () => {
  const port = Number(process.env.SMTP_PORT) || SMTP_DEFAULT_PORT;
  return {
    host: process.env.SMTP_HOST || SMTP_DEFAULT_HOST,
    port,
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : port === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || SMTP_DEFAULT_FROM,
  };
};

const createTransporter = () => {
  const { host, port, secure, user, pass } = getSmtpConfig();

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
  }
  return null;
};

const logEmailConfiguration = () => {
  const { host, port, user, pass } = getSmtpConfig();
  if (!user || !pass) {
    exceptionLogger.log(
      process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'email.smtp.configuration',
      'SMTP_USER and SMTP_PASS are missing; email-dependent flows cannot deliver email.',
      { context: { provider: 'smtp', host, port, credentialsConfigured: false } }
    );
  }
};

logEmailConfiguration();

const logEmailLocally = (to, subject, textContent, htmlContent) => {
  void subject;
  void textContent;
  void htmlContent;
  exceptionLogger.log('warn', 'email.delivery', 'Email delivery unavailable; message content omitted', {
    context: { recipientEmail: to, provider: 'smtp' },
  });
};

const sendMailGeneric = async (to, subject, textContent, htmlContent, attachments = []) => {
  const transporter = createTransporter();
  if (!transporter) {
    logEmailLocally(to, subject, textContent, htmlContent);
    throw new Error('SMTP email delivery is not configured.');
  }

  const { from } = getSmtpConfig();
  try {
    await transporter.sendMail({
      from,
      replyTo: SMTP_REPLY_TO,
      to,
      subject,
      text: textContent,
      html: htmlContent,
      attachments,
    });
    exceptionLogger.log('info', 'email.smtp.send', 'Email sent', {
      context: { recipientEmail: to, provider: 'smtp' },
    });
  } catch (err) {
    exceptionLogger.exception('email.smtp.send', err, {
      level: 'error', context: { recipientEmail: to, provider: 'smtp', code: err.code },
    });
    logEmailLocally(to, subject, textContent, htmlContent);
    throw err;
  }
};

const emailWrapper = (title, headerSubtitle, contentHtml, footerNote, preheader = headerSubtitle || title) => emailLayout({
  title,
  subtitle: headerSubtitle,
  preheader,
  contentHtml,
  footerNote,
});

const buildItemsHtml = (orderItems = []) => {
  return itemizedOrderTable(orderItems);
};

/**
 * 1. Send OTP Verification Email
 */
const sendOTPEmail = async (email, name, otp, sessionId = null) => {
  const customerName = typeof name === 'string' && name !== 'Customer' && !name.startsWith('Table') ? name : 'Valued Guest';
  const firstName = customerName.trim().split(/\s+/)[0] || 'there';
  const subject = `${otp} is your ZOVIKPOS verification code`;
  const frontendUrl = (process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://zovik-pos.vercel.app' : 'http://localhost:5173')).trim().replace(/\/+$/, '');
  const sessionQuery = typeof sessionId === 'string' && sessionId ? `&sid=${encodeURIComponent(sessionId)}` : '';
  const appUrl = `${frontendUrl}/customer?otp=${encodeURIComponent(otp)}&e=${encodeURIComponent(email)}${sessionQuery}`;
  const preheader = 'Your ZovikPOS email verification code is ready. It is valid for 5 minutes.';
  const bodyText = `Hi ${firstName},\n\nUse this code to verify your email and continue ordering.\n\n${otp}\n\nValid for 5 minutes.\n\nCopy & Open App: ${appUrl}\nCode fills in automatically.\n\nSecurity: Never share this code. If you did not request it, you can safely ignore this email.`;
  const contentHtml = `${greeting(firstName)}
    ${headline('Verify your email', 'Verification', 'info')}
    ${bodyParagraph('Use this code to verify your email and continue ordering.')}
    ${tokenBox(otp)}
    <p class="email-muted" align="center" style="margin:4px 0 16px;color:#64748b;font-size:14px;line-height:1.5;">Valid for 5 minutes</p>
    ${primaryButton(appUrl, 'Copy & Open App')}
    <p class="email-muted" align="center" style="margin:0 0 18px;color:#64748b;font-size:13px;line-height:1.5;">Code fills in automatically</p>
    ${notice('Never share this code. If you did not request it, you can safely ignore this email.', 'info')}`;
  const htmlContent = emailLayout({ title: subject, subtitle: 'Email verification', preheader, contentHtml });
  const textContent = buildPlainText(preheader, bodyText);

  await sendMailGeneric(email, subject, textContent, htmlContent);
};

/**
 * 2. Send Order Placement Email with Tracking & Receipt
 */
const sendOrderPlacementEmail = async (order) => {
  const userEmail = order.customerEmail || order.user?.email || 'customer@pos.com';
  const userName = order.user?.name || 'Customer';
  const orderNum = order.orderNumber || `#000${order.id}`;
  const tableLabel = formatTableLabel({ tableLabel: order.tableLabel });
  const isCOD = (order.paymentMethod || '').toUpperCase() === 'COD';

  const subject = isCOD
    ? `COD Order Confirmed: ${orderNum} (Pay at Counter) - ZovikPOS`
    : `Order Confirmed: ${orderNum} - ZovikPOS`;

  let baseUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://zovik-pos.vercel.app' : 'http://localhost:5173');
  try {
    const configuredUrl = new URL(process.env.FRONTEND_URL || baseUrl);
    if (configuredUrl.protocol === 'http:' || configuredUrl.protocol === 'https:') {
      baseUrl = configuredUrl.toString().replace(/\/$/, '');
    }
  } catch {
    // Keep the localhost tracking link when FRONTEND_URL is not a valid URL.
  }
  const trackingUrl = `${baseUrl}/customer/track/${encodeURIComponent(order.trackingToken || order.id)}`;

  const { text: itemsText, html: itemsHtml } = buildItemsHtml(order.orderItems);
  const etaMins = order.etaPrediction?.adjustedEta ? `${Math.round(order.etaPrediction.adjustedEta)} mins` : '10-15 mins';
  const paymentStatus = isCOD ? 'Payment due at pickup' : order.paymentStatus;
  const preheader = `Order ${orderNum} is confirmed. View your receipt and live order status.`;
  const bodyText = `Hi ${userName},\n\nYour order has been confirmed.\nOrder Number: ${orderNum}\nTable: ${tableLabel}\n${formatDateTime(order.createdAt) ? `Order date/time: ${formatDateTime(order.createdAt)}\n` : ''}Estimated Ready Time: ~${etaMins}\nPayment Method: ${isCOD ? 'Cash on Delivery (Pay at Counter)' : order.paymentMethod || 'Online'}\nPayment Status: ${paymentStatus || ''}\n\nOrder items:\n${itemsText}\n\nSubtotal: ${formatCurrency(order.subtotal)}\nTax: ${formatCurrency(order.tax)}\n${Number(order.discount) > 0 ? `Discount: ${formatCurrency(order.discount)}\n` : ''}Total: ${formatCurrency(order.total)}\n${isCOD ? `Payment is due at pickup. Please pay ${formatCurrency(order.total)} in cash at the counter.\n` : ''}\nTrack your live order status: ${trackingUrl}`;

  const contentHtml = `${greeting(userName)}
    ${headline('Your order is confirmed', isCOD ? 'Payment due at pickup' : 'Confirmed', isCOD ? 'warning' : 'success')}
    ${bodyParagraph('Your order has been received. Here are your order details.')}
    ${summaryBox([
      ['Order number', orderNum],
      ['Table', tableLabel],
      ['Order date and time', formatDateTime(order.createdAt)],
      ['Estimated ready time', `~${etaMins}`],
      ['Payment method', isCOD ? 'Cash on Delivery (Pay at Counter)' : (order.paymentMethod || 'Online')],
      ['Payment status', paymentStatus],
    ])}
    ${itemsHtml ? `<h2 class="email-text" style="margin:0 0 10px;color:#0f172a;font-size:16px;line-height:1.4;">Order items</h2>${itemsHtml}` : ''}
    ${totalsTable({ subtotal: order.subtotal, tax: order.tax, discount: order.discount, total: order.total })}
    ${isCOD ? notice(`Payment of ${escapeHtml(formatCurrency(order.total))} is due at pickup. Please pay in cash at the counter.`, 'warning') : ''}
    ${divider()}
    ${bodyParagraph('Follow your order as the kitchen prepares it.')}
    ${primaryButton(trackingUrl, 'Track my order')}`;

  const headerTitle = isCOD ? 'COD Order Confirmed' : 'Order Confirmed!';
  const headerSubtitle = isCOD ? `Order ${orderNum} · Payment due at pickup` : `Order ${orderNum} is being prepared`;
  const htmlContent = emailWrapper(headerTitle, headerSubtitle, contentHtml, undefined, preheader);
  const finalTextContent = buildPlainText(preheader, bodyText);
  await sendMailGeneric(userEmail, subject, finalTextContent, htmlContent);
};

/**
 * 3. Payment Confirmed Notification with Order Receipt
 */
const sendPaymentConfirmedEmail = async (order) => {
  const userEmail = order.customerEmail || order.user?.email || 'customer@pos.com';
  const orderNum = order.orderNumber || `#000${order.id}`;
  const tableLabel = formatTableLabel({ tableLabel: order.tableLabel });
  const isCOD = (order.paymentMethod || '').toUpperCase() === 'COD';

  let orderItems = order.orderItems;
  if ((!orderItems || orderItems.length === 0) && order.id) {
    try {
      const { prisma } = require('../config/db');
      const freshOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: { orderItems: { include: { menuItem: true } } },
      });
      if (freshOrder?.orderItems) {
        orderItems = freshOrder.orderItems;
      }
    } catch (err) {
      console.warn('[Email] Could not load order items for receipt:', err.message);
    }
  }

  const { text: itemsText, html: itemsHtml } = buildItemsHtml(orderItems || []);

  let baseUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://zovik-pos.vercel.app' : 'http://localhost:5173');
  try {
    const configuredUrl = new URL(process.env.FRONTEND_URL || baseUrl);
    if (configuredUrl.protocol === 'http:' || configuredUrl.protocol === 'https:') {
      baseUrl = configuredUrl.toString().replace(/\/$/, '');
    }
  } catch {}
  const trackingUrl = `${baseUrl}/customer/track/${encodeURIComponent(order.trackingToken || order.id)}`;

  const subject = isCOD
    ? `Cash Payment Received: ${orderNum} - ZovikPOS`
    : `Payment Verified: ${orderNum} - ZovikPOS`;

  const amount = formatCurrency(order.total);
  const paymentMethod = isCOD ? 'Cash at counter' : (order.paymentMethod || 'Online');
  const dateTime = formatDateTime(order.createdAt);
  const preheader = `Receipt for order ${orderNum}. Payment received.`;
  const bodyText = `${isCOD ? 'Your cash payment' : 'Your payment'} of ${amount} for order ${orderNum} has been ${isCOD ? 'received at the counter' : 'verified and confirmed'}.\n\nOrder Number: ${orderNum}\nTable: ${tableLabel}\nPayment Method: ${paymentMethod}\n${order.paymentTxId ? `Transaction reference: ${order.paymentTxId}\n` : ''}${dateTime ? `Order date and time: ${dateTime}\n` : ''}\nReceipt details:\n${itemsText}\n\nSubtotal: ${formatCurrency(order.subtotal)}\nTax: ${formatCurrency(order.tax)}\n${Number(order.discount) > 0 ? `Discount: ${formatCurrency(order.discount)}\n` : ''}Total Paid: ${amount}\n\nTrack your live order status: ${trackingUrl}`;

  const contentHtml = `${headline(isCOD ? 'Cash payment received' : 'Payment verified', 'Payment received', 'success')}
    ${bodyParagraph(isCOD
      ? `Your cash payment of <strong>${escapeHtml(amount)}</strong> for order <strong>${escapeHtml(orderNum)}</strong> has been received at the counter.`
      : `Your payment of <strong>${escapeHtml(amount)}</strong> via <strong>${escapeHtml(paymentMethod)}</strong> for order <strong>${escapeHtml(orderNum)}</strong> has been verified.`)}
    ${summaryBox([
      ['Order number', orderNum],
      ['Table', tableLabel],
      ['Amount received', amount, true],
      ['Payment method', paymentMethod],
      ['Transaction reference', order.paymentTxId],
      ['Order date and time', dateTime],
    ])}
    ${itemsHtml ? `<h2 class="email-text" style="margin:0 0 10px;color:#0f172a;font-size:16px;line-height:1.4;">Receipt details</h2>${itemsHtml}` : ''}
    ${totalsTable({ subtotal: order.subtotal, tax: order.tax, discount: order.discount, total: order.total })}
    ${divider()}
    ${bodyParagraph('Follow your order as the kitchen prepares it.')}
    ${primaryButton(trackingUrl, 'Track my order')}`;

  const htmlTitle = isCOD ? 'Cash Payment Received' : 'Payment Confirmed';
  const htmlSub = isCOD ? `Counter Receipt for ${orderNum}` : `Receipt for ${orderNum}`;
  const htmlContent = emailWrapper(htmlTitle, htmlSub, contentHtml, undefined, preheader);
  await sendMailGeneric(userEmail, subject, buildPlainText(preheader, bodyText), htmlContent);
};

/**
 * 4. Order Ready for Pickup
 */
const sendOrderReadyEmail = async (order) => {
  const userEmail = order.customerEmail || order.user?.email || 'customer@pos.com';
  const orderNum = order.orderNumber || `#000${order.id}`;
  const tableLabel = formatTableLabel({ tableLabel: order.tableLabel });
  const isCOD = (order.paymentMethod || '').toUpperCase() === 'COD';
  const isUnpaid = isCOD && order.paymentStatus !== 'PAID' && order.paymentStatus !== 'VERIFIED';

  const subject = isUnpaid
    ? `Order Ready for Pickup — Payment Due at Pickup: ${orderNum} - ZovikPOS`
    : `Order Ready for Pickup: ${orderNum} - ZovikPOS`;

  const amount = formatCurrency(order.total);
  const dateTime = formatDateTime(order.createdAt);
  const preheader = isUnpaid ? `Order ${orderNum} is ready. Cash payment is due at pickup.` : `Order ${orderNum} is ready for pickup.`;
  const bodyText = `Your order ${orderNum} is ready. Please proceed to the service counter to collect your meal.\n\nTable: ${tableLabel}\n${dateTime ? `Order date and time: ${dateTime}\n` : ''}${isUnpaid ? `Payment due at pickup: ${amount}. Please pay in cash at the counter before collecting your meal.` : ''}`;
  const contentHtml = `${headline('Your order is ready', 'Ready for pickup', 'success')}
    ${bodyParagraph(`Order <strong>${escapeHtml(orderNum)}</strong> has been prepared. Please proceed to the service counter to collect your meal.`)}
    ${summaryBox([
      ['Order number', orderNum],
      ['Table', tableLabel],
      ['Order date and time', dateTime],
    ])}
    ${isUnpaid ? notice(`Payment of ${escapeHtml(amount)} is due at pickup. Please pay in cash at the counter before collecting your meal.`, 'warning') : ''}`;

  const titleText = isUnpaid ? 'Meal Ready · Payment Due' : 'Meal Ready!';
  const subText = isUnpaid ? `Order ${orderNum} ready · Pay Rs. ${order.total.toFixed(2)} at counter` : `Order ${orderNum} ready at counter`;
  const htmlContent = emailWrapper(titleText, subText, contentHtml, undefined, preheader);
  await sendMailGeneric(userEmail, subject, buildPlainText(preheader, bodyText), htmlContent);
};

/**
 * 5. Order Completed
 */
const sendOrderCompletionEmail = async (order) => {
  const userEmail = order.customerEmail || order.user?.email || 'customer@pos.com';
  const orderNum = order.orderNumber || `#000${order.id}`;
  const subject = `Order Completed: ${orderNum} - Thank You for Dining with Us!`;
  const paid = ['PAID', 'VERIFIED'].includes(String(order.paymentStatus || '').toUpperCase());
  const totalLabel = paid ? 'Total paid' : 'Order total';
  const total = formatCurrency(order.total);
  const dateTime = formatDateTime(order.createdAt);
  const preheader = `Thank you. Order ${orderNum} is complete.`;
  const bodyText = `Thank you for dining with ZovikPOS. Order ${orderNum} is completed.\n${totalLabel}: ${total}\n${dateTime ? `Order date and time: ${dateTime}\n` : ''}We look forward to serving you again soon.`;
  const contentHtml = `${headline('Thank you for dining with us', 'Completed', 'success')}
    ${bodyParagraph(`Order <strong>${escapeHtml(orderNum)}</strong> is complete. We hope you enjoyed your meal.`)}
    ${summaryBox([
      ['Order number', orderNum],
      [totalLabel, total, true],
      ['Order date and time', dateTime],
    ])}
    ${bodyParagraph('We look forward to serving you again soon.')}`;

  const htmlContent = emailWrapper('Order Completed', 'Thank you for dining with us', contentHtml, undefined, preheader);
  await sendMailGeneric(userEmail, subject, buildPlainText(preheader, bodyText), htmlContent);
};

/**
 * 6. Order Cancellation / Refund
 */
const sendOrderCancellationEmail = async (order, reason = 'CANCELLED') => {
  const userEmail = order.customerEmail || order.user?.email || 'customer@pos.com';
  const orderNum = order.orderNumber || `#000${order.id}`;
  const subject = `Order ${reason}: ${orderNum} - ZovikPOS`;
  const total = formatCurrency(order.total);
  const preheader = `Order ${orderNum} has a status update.`;
  const bodyText = `Your order ${orderNum} for ${total} has been marked as ${reason}. If you have questions or require a refund, please visit the cashier counter with your order number.`;
  const contentHtml = `${headline(`Order ${reason}`, reason, 'danger')}
    ${bodyParagraph(`Order <strong>${escapeHtml(orderNum)}</strong> for <strong>${escapeHtml(total)}</strong> has been marked as <strong>${escapeHtml(reason)}</strong>.`)}
    ${summaryBox([
      ['Order number', orderNum],
      ['Order total', total, true],
      ['Status', reason],
    ])}
    ${notice('If you have questions or require a refund, please visit the cashier counter with your order number.', 'danger')}`;

  const htmlContent = emailWrapper(`Order ${reason}`, `Status update for ${orderNum}`, contentHtml, undefined, preheader);
  await sendMailGeneric(userEmail, subject, buildPlainText(preheader, bodyText), htmlContent);
};

module.exports = {
  sendOrderPlacementEmail,
  sendPaymentConfirmedEmail,
  sendOrderReadyEmail,
  sendOrderCompletionEmail,
  sendOrderCancellationEmail,
  sendOTPEmail,
};
