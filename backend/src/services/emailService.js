const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: parseInt(port, 10) === 465,
      auth: { user, pass },
    });
  }
  return null;
};

const sendViaResend = async (to, subject, text, html) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim() === '') return false;

  try {
    const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const response = await axios.post(
      'https://api.resend.com/emails',
      { from, to: [to], subject, text, html },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    console.log(`[Email Service] Resend API success. Sent to ${to}. ID: ${response.data.id}`);
    return true;
  } catch (err) {
    console.error(`[Email Service] Resend API failed for ${to}:`, err.response?.data || err.message);
    return false;
  }
};

const logEmailLocally = (to, subject, textContent, htmlContent) => {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[Email Service] Email delivery failed; sensitive message content was not written to disk.');
    return;
  }

  try {
    const logPath = path.join(__dirname, '../../email_logs.txt');
    const logDivider = '\n' + '='.repeat(80) + '\n';
    const logEntry = `${logDivider}DATE/TIME: ${new Date().toLocaleString()}
TO: ${to}
SUBJECT: ${subject}
TEXT CONTENT:
${textContent}
HTML PREVIEW:
${htmlContent}
${logDivider}`;

    fs.appendFileSync(logPath, logEntry, 'utf8');
    console.log(`[Email Service] Offline fallback: Email written to ${logPath}`);
  } catch (err) {
    console.error('[Email Service] Failed to write local email log:', err);
  }
};

const sendMailGeneric = async (to, subject, textContent, htmlContent, attachments = []) => {
  const sentViaResend = await sendViaResend(to, subject, textContent, htmlContent);
  if (sentViaResend) return;

  const transporter = createTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"ZovikPOS Canteen" <${process.env.SMTP_USER || 'no-reply@zovikpos.com'}>`,
        to,
        subject,
        text: textContent,
        html: htmlContent,
        attachments,
      });
      console.log(`[Email Service] SMTP email sent successfully to ${to}`);
    } catch (err) {
      console.error(`[Email Service] SMTP send failed: ${err.message}`);
      logEmailLocally(to, subject, textContent, htmlContent);
    }
  } else {
    logEmailLocally(to, subject, textContent, htmlContent);
  }
};

const emailWrapper = (title, headerSubtitle, contentHtml, footerNote = 'Smart Canteen Point of Sale System') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF9F7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #171717;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FAF9F7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(23, 23, 23, 0.08), 0 8px 10px -6px rgba(23, 23, 23, 0.04); border: 1px solid #E7E5E4;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #E85D2A 0%, #F97316 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
              <div style="display: inline-block; background: rgba(255, 255, 255, 0.2); padding: 8px 16px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.3);">
                ZovikPOS
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">${escapeHtml(title)}</h1>
              ${headerSubtitle ? `<p style="margin: 6px 0 0 0; font-size: 13px; color: rgba(255, 255, 255, 0.9); font-weight: 500;">${escapeHtml(headerSubtitle)}</p>` : ''}
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #FFF8F2; border-top: 1px solid #E7E5E4; padding: 20px 24px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #78716C; font-weight: 600;">
                © 2026 ZovikPOS · ${escapeHtml(footerNote)}
              </p>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #A8A29E;">
                This is an automated system notification. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const buildItemsHtml = (orderItems = []) => {
  let text = '';
  let html = '';

  orderItems.forEach((item) => {
    const name = item.nameSnapshot || item.menuItem?.name || 'Item';
    const safeName = escapeHtml(name);
    const price = item.priceSnapshot ?? item.price ?? 0;
    const subtotal = item.subtotal ?? (price * item.quantity);
    text += `- ${name} x ${item.quantity} @ Rs. ${price.toFixed(2)} = Rs. ${subtotal.toFixed(2)}\n`;
    html += `
      <tr>
        <td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; font-size: 13px; font-weight: 600; color: #1e293b;">
          ${safeName}
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; text-align: center; font-size: 13px; font-weight: 600; color: #64748b;">
          x${item.quantity}
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; text-align: right; font-size: 13px; color: #64748b;">
          Rs. ${price.toFixed(2)}
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; text-align: right; font-size: 13px; font-weight: 700; color: #0f172a;">
          Rs. ${subtotal.toFixed(2)}
        </td>
      </tr>
    `;
  });

  return { text, html };
};

/**
 * 1. Send OTP Verification Email
 */
const sendOTPEmail = async (email, name, otp) => {
  const customerName = typeof name === 'string' && name !== 'Customer' && !name.startsWith('Table') ? name : 'Valued Guest';
  const safeCustomerName = escapeHtml(customerName);
  const subject = `Your Verification Code: ${otp} - ZovikPOS`;
  const textContent = `Hi ${customerName},\n\nYour OTP for verification is: ${otp}\n\nThis code expires in 5 minutes.\n\nBest regards,\nZovikPOS Team`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: 600; color: #0f172a;">
      Hello ${safeCustomerName},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      Use the One-Time Password (OTP) below to authenticate your dining session and access the digital menu:
    </p>

    <div style="text-align: center; margin: 28px 0;">
      <div style="display: inline-block; background: #FFF8F2; border: 2px dashed #E85D2A; border-radius: 16px; padding: 18px 36px;">
        <span style="font-family: 'Courier New', Courier, monospace, monospace; font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #E85D2A; display: block; margin-left: 10px;">
          ${otp}
        </span>
      </div>
      <div style="margin-top: 12px; font-size: 12px; font-weight: 600; color: #ef4444;">
        ⏱️ Code valid for 5 minutes only
      </div>
    </div>

    <div style="background-color: #FFF8F2; border-left: 4px solid #E85D2A; padding: 14px 18px; border-radius: 0 12px 12px 0; margin-top: 24px;">
      <p style="margin: 0; font-size: 12px; color: #78716C; line-height: 1.5;">
        <strong>Security Notice:</strong> If you did not initiate this request, someone may have entered your email by mistake. You can safely disregard this email.
      </p>
    </div>
  `;

  const htmlContent = emailWrapper('Email Verification', 'Secure Dining Session Authentication', contentHtml);
  await sendMailGeneric(email, subject, textContent, htmlContent);
};

/**
 * 2. Send Order Placement Email with Tracking & Receipt
 */
const sendOrderPlacementEmail = async (order) => {
  const userEmail = order.customerEmail || order.user?.email || 'customer@pos.com';
  const userName = order.user?.name || 'Customer';
  const orderNum = order.orderNumber || `#000${order.id}`;
  const htmlUserName = escapeHtml(userName);
  const htmlOrderNum = escapeHtml(orderNum);
  const htmlTableNumber = escapeHtml(order.tableNumber || 'Takeaway');
  const isCOD = (order.paymentMethod || '').toUpperCase() === 'COD';
  const htmlPaymentMethod = isCOD ? 'Cash on Delivery (Pay at Counter)' : escapeHtml(order.paymentMethod || 'Online');
  const htmlPaymentStatus = isCOD ? 'Unpaid (Due at Pickup)' : escapeHtml(order.paymentStatus);

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
  const htmlTrackingUrl = escapeHtml(trackingUrl);

  const { text: itemsText, html: itemsHtml } = buildItemsHtml(order.orderItems);
  const etaMins = order.etaPrediction?.adjustedEta ? `${Math.round(order.etaPrediction.adjustedEta)} mins` : '10-15 mins';

  const codInstructionText = isCOD
    ? `\nPAYMENT NOTICE: Payment of Rs. ${order.total.toFixed(2)} is due at pickup. Please pay in cash at the counter.\n`
    : '';

  const textContent = `Hi ${userName},

Thank you for your order!
Order Number: ${orderNum}
Table: ${order.tableNumber || 'Takeaway'}
Estimated Ready Time: ~${etaMins}
Payment Method: ${isCOD ? 'Cash on Delivery (Pay at Counter)' : order.paymentMethod || 'Online'}
Payment Status: ${isCOD ? 'Payment Due at Pickup / Counter' : order.paymentStatus}
${codInstructionText}
Order Breakdown:
${itemsText}
Total Amount: Rs. ${order.total.toFixed(2)}

Track your live order status here:
${trackingUrl}

ZovikPOS Team`;

  const codCalloutHtml = isCOD ? `
    <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 12px; padding: 14px 18px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 13px; font-weight: 700; color: #92400E;">
        💵 Payment Due at Counter: Please have Rs. ${escapeHtml(order.total.toFixed(2))} ready in cash to pay at the counter upon collecting your meal.
      </p>
    </div>
  ` : '';

  const contentHtml = `
    <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #171717;">
      Hi ${htmlUserName},
    </p>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #57534E; line-height: 1.5;">
      ${isCOD
        ? 'Your order has been confirmed. Payment is due at pickup or delivery according to the existing COD workflow. Here are your order details:'
        : 'Your order has been received and is queued for preparation. Here are your order details:'}
    </p>

    ${codCalloutHtml}

    <!-- Info Box -->
    <div style="background-color: #FFF8F2; border: 1px solid #E7E5E4; border-radius: 14px; padding: 18px; margin-bottom: 24px;">
      <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 13px;">
        <tr>
          <td style="color: #78716C; font-weight: 500;">Order Number:</td>
          <td style="text-align: right; font-weight: 800; color: #E85D2A; font-size: 14px;">${htmlOrderNum}</td>
        </tr>
        <tr>
          <td style="color: #78716C; font-weight: 500;">Dining Table / Location:</td>
          <td style="text-align: right; font-weight: 700; color: #171717;">${htmlTableNumber}</td>
        </tr>
        <tr>
          <td style="color: #78716C; font-weight: 500;">Estimated Preparation Time:</td>
          <td style="text-align: right; font-weight: 700; color: #E85D2A;">~${escapeHtml(etaMins)}</td>
        </tr>
        <tr>
          <td style="color: #78716C; font-weight: 500;">Payment Mode &amp; Status:</td>
          <td style="text-align: right; font-weight: 600; color: #171717;">${htmlPaymentMethod} (${htmlPaymentStatus})</td>
        </tr>
      </table>
    </div>

    <!-- Items Table -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 20px; border-collapse: collapse;">
      <thead>
        <tr style="background-color: #FAF9F7; text-transform: uppercase; font-size: 11px; font-weight: 800; color: #78716C; letter-spacing: 0.5px;">
          <th style="padding: 10px; text-align: left; border-radius: 8px 0 0 8px;">Item</th>
          <th style="padding: 10px; text-align: center;">Qty</th>
          <th style="padding: 10px; text-align: right;">Price</th>
          <th style="padding: 10px; text-align: right; border-radius: 0 8px 8px 0;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <!-- Total Bill -->
    <div style="background-color: #FFF8F2; border-radius: 12px; padding: 14px 18px; text-align: right; margin-bottom: 24px; border: 1px solid #E7E5E4;">
      <span style="font-size: 14px; font-weight: 600; color: #78716C; margin-right: 12px;">Grand Total:</span>
      <span style="font-size: 20px; font-weight: 900; color: #E85D2A;">Rs. ${escapeHtml(order.total.toFixed(2))}</span>
    </div>

    <!-- Live Order Tracking Button Card -->
    <div style="text-align: center; padding: 24px; background: linear-gradient(135deg, #FFF8F2 0%, #FFFCF9 100%); border: 1px solid #FED7AA; border-radius: 16px; margin-top: 24px;">
      <h4 style="margin: 0 0 6px 0; font-size: 15px; font-weight: 800; color: #E85D2A;">
        Live Order Tracking
      </h4>
      <p style="margin: 0 0 16px 0; font-size: 13px; color: #57534E;">
        View real-time kitchen preparation status, estimated time, and live updates.
      </p>
      <a href="${htmlTrackingUrl}" style="background: linear-gradient(135deg, #E85D2A 0%, #F97316 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-size: 14px; font-weight: 800; display: inline-block; box-shadow: 0 4px 12px rgba(232, 93, 42, 0.3);">
        Track My Order Live ➔
      </a>
    </div>
  `;

  const headerTitle = isCOD ? 'COD Order Confirmed' : 'Order Confirmed!';
  const headerSubtitle = isCOD ? `Order ${orderNum} · Payment due at pickup` : `Order ${orderNum} is being prepared`;
  const htmlContent = emailWrapper(headerTitle, headerSubtitle, contentHtml);
  await sendMailGeneric(userEmail, subject, textContent, htmlContent);
};

/**
 * 3. Payment Confirmed Notification
 */
const sendPaymentConfirmedEmail = async (order) => {
  const userEmail = order.customerEmail || order.user?.email || 'customer@pos.com';
  const orderNum = order.orderNumber || `#000${order.id}`;
  const htmlOrderNum = escapeHtml(orderNum);
  const isCOD = (order.paymentMethod || '').toUpperCase() === 'COD';

  const subject = isCOD
    ? `Cash Payment Received: ${orderNum} - ZovikPOS`
    : `Payment Verified: ${orderNum} - ZovikPOS`;

  const textContent = isCOD
    ? `Your cash payment of Rs. ${order.total.toFixed(2)} for ${orderNum} has been received at the counter.`
    : `Your payment of Rs. ${order.total.toFixed(2)} for ${orderNum} has been verified and confirmed.`;

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="display: inline-block; background-color: #DCFCE7; border-radius: 50%; padding: 16px; margin-bottom: 12px;">
        <span style="font-size: 28px;">${isCOD ? '💵' : '✅'}</span>
      </div>
      <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #15803D;">
        ${isCOD ? 'Cash Payment Received at Counter' : 'Online Payment Verified &amp; Confirmed'}
      </h3>
    </div>

    <p style="font-size: 14px; color: #57534E; line-height: 1.6; text-align: center; margin-bottom: 24px;">
      ${isCOD
        ? `We have successfully received your cash payment of <strong style="color: #171717;">Rs. ${escapeHtml(order.total.toFixed(2))}</strong> at the counter for order <strong style="color: #E85D2A;">${htmlOrderNum}</strong>.`
        : `We have successfully verified your payment of <strong style="color: #171717;">Rs. ${escapeHtml(order.total.toFixed(2))}</strong> via <strong style="color: #171717;">${escapeHtml(order.paymentMethod || 'Online')}</strong> for order <strong style="color: #E85D2A;">${htmlOrderNum}</strong>.`}
    </p>

    <div style="background-color: #FFF8F2; border: 1px solid #E7E5E4; border-radius: 12px; padding: 14px 18px; text-align: center;">
      <p style="margin: 0; font-size: 13px; font-weight: 600; color: #57534E;">
        🍳 Thank you! Your receipt has been generated.
      </p>
    </div>
  `;

  const htmlTitle = isCOD ? 'Cash Payment Received' : 'Payment Confirmed';
  const htmlSub = isCOD ? `Counter Receipt for ${orderNum}` : `Receipt for ${orderNum}`;
  const htmlContent = emailWrapper(htmlTitle, htmlSub, contentHtml);
  await sendMailGeneric(userEmail, subject, textContent, htmlContent);
};

/**
 * 4. Order Ready for Pickup
 */
const sendOrderReadyEmail = async (order) => {
  const userEmail = order.customerEmail || order.user?.email || 'customer@pos.com';
  const orderNum = order.orderNumber || `#000${order.id}`;
  const htmlOrderNum = escapeHtml(orderNum);
  const htmlTableNumber = escapeHtml(order.tableNumber || 'Main Counter');
  const isCOD = (order.paymentMethod || '').toUpperCase() === 'COD';
  const isUnpaid = isCOD && order.paymentStatus !== 'PAID' && order.paymentStatus !== 'VERIFIED';

  const subject = isUnpaid
    ? `Order Ready for Pickup — Payment Due at Pickup: ${orderNum} 🛎️ - ZovikPOS`
    : `Order Ready for Pickup: ${orderNum} 🛎️ - ZovikPOS`;

  const textContent = isUnpaid
    ? `Your order ${orderNum} is ready! Please pay Rs. ${order.total.toFixed(2)} in cash at the counter when collecting your meal.`
    : `Your order ${orderNum} is ready! Please collect your meal.`;

  const paymentReminderHtml = isUnpaid ? `
    <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 12px; padding: 14px 18px; text-align: center; margin-top: 16px;">
      <p style="margin: 0; font-size: 13px; font-weight: 700; color: #92400E;">
        💵 Payment Due at Pickup: Please pay Rs. ${escapeHtml(order.total.toFixed(2))} in cash at the counter before collecting your meal.
      </p>
    </div>
  ` : '';

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="display: inline-block; background-color: #DCFCE7; border-radius: 50%; padding: 16px; margin-bottom: 12px;">
        <span style="font-size: 28px;">🛎️</span>
      </div>
      <h3 style="margin: 0; font-size: 20px; font-weight: 800; color: #15803D;">Your Order is Ready!</h3>
    </div>

    <p style="font-size: 14px; color: #57534E; line-height: 1.6; text-align: center; margin-bottom: 24px;">
      Order <strong style="color: #E85D2A;">${htmlOrderNum}</strong> has been prepared fresh and hot. Please proceed to the service counter to collect your meal.
    </p>

    <div style="background-color: #FFF8F2; border: 1px solid #E7E5E4; border-radius: 12px; padding: 14px 18px; text-align: center;">
      <p style="margin: 0; font-size: 13px; font-weight: 700; color: #171717;">
        📍 Pickup Table / Tag: ${htmlTableNumber}
      </p>
    </div>

    ${paymentReminderHtml}
  `;

  const titleText = isUnpaid ? 'Meal Ready · Payment Due' : 'Meal Ready!';
  const subText = isUnpaid ? `Order ${orderNum} ready · Pay Rs. ${order.total.toFixed(2)} at counter` : `Order ${orderNum} ready at counter`;
  const htmlContent = emailWrapper(titleText, subText, contentHtml);
  await sendMailGeneric(userEmail, subject, textContent, htmlContent);
};

/**
 * 5. Order Completed
 */
const sendOrderCompletionEmail = async (order) => {
  const userEmail = order.customerEmail || order.user?.email || 'customer@pos.com';
  const orderNum = order.orderNumber || `#000${order.id}`;
  const htmlOrderNum = escapeHtml(orderNum);
  const subject = `Order Completed: ${orderNum} - Thank You for Dining with Us!`;
  const textContent = `Thank you for dining with ZovikPOS! Order ${orderNum} is completed.`;

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="display: inline-block; background-color: #FFF8F2; border-radius: 50%; padding: 16px; margin-bottom: 12px;">
        <span style="font-size: 28px;">✨</span>
      </div>
      <h3 style="margin: 0; font-size: 20px; font-weight: 800; color: #E85D2A;">Thank You for Dining with Us!</h3>
    </div>

    <p style="font-size: 14px; color: #57534E; line-height: 1.6; text-align: center; margin-bottom: 24px;">
      We hope you thoroughly enjoyed your meal. Order <strong style="color: #E85D2A;">${htmlOrderNum}</strong> has been marked as completed.
    </p>

    <p style="text-align: center; font-size: 13px; color: #78716C;">
      We look forward to serving you again soon!
    </p>
  `;

  const htmlContent = emailWrapper('Order Completed', 'Thank You!', contentHtml);
  await sendMailGeneric(userEmail, subject, textContent, htmlContent);
};

/**
 * 6. Order Cancellation / Refund
 */
const sendOrderCancellationEmail = async (order, reason = 'CANCELLED') => {
  const userEmail = order.customerEmail || order.user?.email || 'customer@pos.com';
  const orderNum = order.orderNumber || `#000${order.id}`;
  const htmlOrderNum = escapeHtml(orderNum);
  const htmlReason = escapeHtml(reason);
  const subject = `Order ${reason}: ${orderNum} - ZovikPOS`;
  const textContent = `Your order ${orderNum} has been marked as ${reason}.`;

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="display: inline-block; background-color: #fee2e2; border-radius: 50%; padding: 16px; margin-bottom: 12px;">
        <span style="font-size: 28px;">⚠️</span>
      </div>
      <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #b91c1c;">Order ${htmlReason}</h3>
    </div>

    <p style="font-size: 14px; color: #475569; line-height: 1.6; text-align: center; margin-bottom: 24px;">
      Your order <strong style="color: #0f172a;">${htmlOrderNum}</strong> for <strong style="color: #0f172a;">Rs. ${escapeHtml(order.total.toFixed(2))}</strong> has been marked as <span style="color: #dc2626; font-weight: 700;">${htmlReason}</span>.
    </p>

    <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 14px 18px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #9f1239;">
        If you have any questions or require a refund, please visit the cashier counter with your order number.
      </p>
    </div>
  `;

  const htmlContent = emailWrapper(`Order ${reason}`, `Status update for ${orderNum}`, contentHtml);
  await sendMailGeneric(userEmail, subject, textContent, htmlContent);
};

module.exports = {
  sendOrderPlacementEmail,
  sendPaymentConfirmedEmail,
  sendOrderReadyEmail,
  sendOrderCompletionEmail,
  sendOrderCancellationEmail,
  sendOTPEmail,
};
