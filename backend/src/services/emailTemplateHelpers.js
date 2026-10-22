const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const getEmailAssetBaseUrl = () => {
  const configuredUrl = String(process.env.FRONTEND_URL || 'https://zovik-pos.vercel.app').trim();
  try {
    const url = new URL(configuredUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString().replace(/\/+$/, '');
  } catch {
    // Use the existing production frontend URL as the branded email asset host.
  }
  return 'https://zovik-pos.vercel.app';
};

const formatCurrency = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `Rs. ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
};

const statusBadge = (label, tone = 'info') => {
  const tones = {
    success: { background: '#dcfce7', color: '#166534', border: '#86efac' },
    danger: { background: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    warning: { background: '#fef3c7', color: '#92400e', border: '#fcd34d' },
    info: { background: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  };
  const colors = tones[tone] || tones.info;
  return `<span style="display:inline-block;border:1px solid ${colors.border};border-radius:999px;background-color:${colors.background};color:${colors.color};padding:5px 10px;font-size:12px;font-weight:700;line-height:1.2;">${escapeHtml(label)}</span>`;
};

const headline = (title, badge, tone = 'info') => `
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:0 0 16px;">
    <tr>
      <td class="email-text" align="left" style="padding:0;color:#0f172a;font-size:22px;font-weight:700;line-height:1.3;">${escapeHtml(title)}</td>
      <td align="right" style="padding-left:8px;">${statusBadge(badge, tone)}</td>
    </tr>
  </table>`;

const greeting = (name) => `<p class="email-body" style="margin:0 0 12px;color:#334155;font-size:16px;line-height:1.55;">Hi ${escapeHtml(name)},</p>`;

const bodyParagraph = (content) => `<p class="email-body" style="margin:0 0 18px;color:#334155;font-size:16px;line-height:1.55;">${content}</p>`;

const divider = () => '<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:22px 0;"><tr><td class="email-divider" style="border-top:1px solid #e2e8f0;font-size:0;line-height:0;">&nbsp;</td></tr></table>';

const summaryBox = (rows = []) => {
  const visibleRows = rows.filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  if (!visibleRows.length) return '';
  return `<table role="presentation" class="email-panel" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f8fafc" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate;background-color:#f8fafc;margin:0 0 20px;">
    ${visibleRows.map(([label, value, emphasis]) => `<tr>
      <td class="email-muted" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:15px;line-height:1.45;">${escapeHtml(label)}</td>
      <td class="email-text" align="right" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:${emphasis ? '#0f172a' : '#334155'};font-size:15px;font-weight:${emphasis ? '700' : '600'};line-height:1.45;word-break:break-word;">${escapeHtml(value)}</td>
    </tr>`).join('')}
  </table>`;
};

const itemizedOrderTable = (orderItems = []) => {
  const rows = Array.isArray(orderItems) ? orderItems : [];
  if (!rows.length) return { html: '', text: '' };
  const header = `<tr class="email-items-header" bgcolor="#f1f5f9">
    <th class="email-muted" scope="col" align="left" style="padding:10px 8px;color:#475569;font-size:12px;line-height:1.4;">Item</th>
    <th class="email-muted" scope="col" align="center" style="padding:10px 8px;color:#475569;font-size:12px;line-height:1.4;">Qty</th>
    <th class="email-muted" scope="col" align="right" style="padding:10px 8px;color:#475569;font-size:12px;line-height:1.4;">Price</th>
    <th class="email-muted" scope="col" align="right" style="padding:10px 8px;color:#475569;font-size:12px;line-height:1.4;">Total</th>
  </tr>`;
  const htmlRows = rows.map((item) => {
    const name = item.nameSnapshot || item.menuItem?.name || 'Item';
    const price = item.priceSnapshot ?? item.price ?? 0;
    const subtotal = item.subtotal ?? (Number(price) * Number(item.quantity || 0));
    return `<tr>
      <td class="email-text" data-label="Item" style="padding:11px 8px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:15px;line-height:1.45;">${escapeHtml(name)}</td>
      <td class="email-muted" data-label="Qty" align="center" style="padding:11px 8px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:15px;line-height:1.45;">${escapeHtml(item.quantity)}</td>
      <td class="email-muted" data-label="Price" align="right" style="padding:11px 8px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:15px;line-height:1.45;">${escapeHtml(formatCurrency(price))}</td>
      <td class="email-text" data-label="Total" align="right" style="padding:11px 8px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:15px;font-weight:700;line-height:1.45;">${escapeHtml(formatCurrency(subtotal))}</td>
    </tr>`;
  }).join('');
  const text = rows.map((item) => {
    const name = item.nameSnapshot || item.menuItem?.name || 'Item';
    const price = item.priceSnapshot ?? item.price ?? 0;
    const subtotal = item.subtotal ?? (Number(price) * Number(item.quantity || 0));
    return `- ${name} x ${item.quantity} @ ${formatCurrency(price)} = ${formatCurrency(subtotal)}`;
  }).join('\n');
  return {
    html: `<table role="table" class="email-items" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e2e8f0;border-collapse:collapse;margin:0 0 18px;"><thead>${header}</thead><tbody>${htmlRows}</tbody></table>`,
    text,
  };
};

const totalsTable = ({ subtotal, tax, discount, total } = {}) => {
  const rows = [];
  if (subtotal !== undefined && subtotal !== null) rows.push(['Subtotal', formatCurrency(subtotal)]);
  if (tax !== undefined && tax !== null) rows.push(['Tax', formatCurrency(tax)]);
  if (Number(discount) > 0) rows.push(['Discount', `− ${formatCurrency(discount)}`]);
  if (total !== undefined && total !== null) rows.push(['Total', formatCurrency(total), true]);
  if (!rows.length) return '';
  return `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
    ${rows.map(([label, value, isTotal]) => `<tr>
      <td class="email-text" style="padding:8px 4px;border-top:${isTotal ? '1px dashed #94a3b8' : '0'};color:${isTotal ? '#0f172a' : '#475569'};font-size:${isTotal ? '17px' : '15px'};font-weight:${isTotal ? '700' : '500'};line-height:1.45;">${label}</td>
      <td class="email-text" align="right" style="padding:8px 4px;border-top:${isTotal ? '1px dashed #94a3b8' : '0'};color:${isTotal ? '#0f172a' : '#334155'};font-size:${isTotal ? '17px' : '15px'};font-weight:${isTotal ? '700' : '600'};line-height:1.45;">${escapeHtml(value)}</td>
    </tr>`).join('')}
  </table>`;
};

const notice = (message, tone = 'info') => {
  const styles = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534' },
    danger: { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b' },
    warning: { bg: '#fffbeb', border: '#fcd34d', color: '#92400e' },
    info: { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af' },
  };
  const style = styles[tone] || styles.info;
  return `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:0 0 18px;">
    <tr><td style="padding:14px 16px;border:1px solid ${style.border};border-radius:10px;background-color:${style.bg};color:${style.color};font-size:15px;line-height:1.5;">${message}</td></tr>
  </table>`;
};

const tokenBox = (value) => `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:18px 0 8px;"><tr>
  <td align="center" style="padding:18px 12px;border:1px solid #cbd5e1;border-radius:12px;background-color:#f8fafc;color:#0f172a;font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:8px;line-height:1.25;word-break:break-all;">${escapeHtml(value)}</td>
</tr></table>`;

const primaryButton = (url, label) => {
  const href = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin:22px auto;border-collapse:separate;">
    <tr><td align="center" valign="middle" height="50" bgcolor="#ff6a00" style="height:50px;border-radius:8px;background-color:#ff6a00;">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="16%" strokecolor="#ff6a00" fillcolor="#ff6a00"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!--><a href="${href}" style="display:inline-block;padding:0 24px;border-radius:8px;background-color:#ff6a00;color:#ffffff;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;line-height:50px;text-align:center;text-decoration:none;">${safeLabel}</a><!--<![endif]-->
    </td></tr>
  </table>`;
};

const emailLayout = ({ title, subtitle = '', preheader = '', contentHtml = '' }) => {
  const logoUrl = `${getEmailAssetBaseUrl()}/assets/email-logo.png`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:light dark;supported-color-schemes:light dark}
    @media screen and (max-width:620px){.email-outer{padding:16px 8px!important}.email-card{width:100%!important}.email-content{padding:24px 18px!important}.email-brand{padding:17px 18px!important}.email-title{font-size:20px!important}}
    @media screen and (max-width:420px){.email-items thead{display:none!important}.email-items tr{display:block!important;border-bottom:1px solid #e2e8f0!important}.email-items td{display:block!important;width:100%!important;box-sizing:border-box!important;padding:6px 12px!important;text-align:left!important}.email-items td:before{content:attr(data-label) ': ';color:#64748b;font-weight:600}}
    @media (prefers-color-scheme:dark){body,.email-page{background-color:#111827!important}.email-card{background-color:#1f2937!important;border-color:#374151!important}.email-content{background-color:#1f2937!important}.email-text{color:#f8fafc!important}.email-body{color:#e2e8f0!important}.email-muted{color:#cbd5e1!important}.email-panel{background-color:#273449!important;border-color:#475569!important}.email-divider{border-color:#475569!important}.email-items-header{background-color:#273449!important}.email-footer{background-color:#172033!important;border-color:#374151!important;color:#cbd5e1!important}}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;color:#334155;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" class="email-page" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f4f5f7" style="width:100%;border-collapse:collapse;background-color:#f4f5f7;">
    <tr><td class="email-outer" align="center" style="padding:28px 12px;">
      <table role="presentation" class="email-card" width="600" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="width:100%;max-width:600px;border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate;background-color:#ffffff;">
        <tr><td height="5" bgcolor="#ff6a00" style="height:5px;font-size:0;line-height:5px;background-color:#ff6a00;">&nbsp;</td></tr>
        <tr><td class="email-brand" style="padding:18px 28px;border-bottom:1px solid #e2e8f0;">
          <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr><td valign="middle" style="padding-right:10px;"><img src="${escapeHtml(logoUrl)}" width="38" height="38" alt="ZovikPOS" style="display:block;width:38px;height:38px;border:0;outline:none;text-decoration:none;"></td>
            <td valign="middle"><span class="email-text" style="display:block;color:#0f172a;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;line-height:1.25;">ZovikPOS</span><span class="email-muted" style="display:block;color:#64748b;font-size:12px;line-height:1.35;">Smart Dining</span></td></tr>
          </table>
        </td></tr>
        <tr><td class="email-content" style="padding:28px 30px;background-color:#ffffff;">
          ${subtitle ? `<p class="email-muted" style="margin:0 0 16px;color:#64748b;font-size:13px;line-height:1.45;">${escapeHtml(subtitle)}</p>` : ''}
          ${contentHtml}
        </td></tr>
        <tr><td class="email-footer" align="center" style="padding:18px 24px;border-top:1px solid #e2e8f0;background-color:#f8fafc;color:#64748b;font-size:12px;line-height:1.55;">
          <strong style="color:inherit;font-size:13px;">ZovikPOS</strong><br>
          © ${new Date().getFullYear()} ZovikPOS
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.replace(/[ \t]+$/gm, '');
};

const buildPlainText = (preheader, bodyText) => `${preheader}\n\n${bodyText.trim()}\n\nZovikPOS\n© ${new Date().getFullYear()} ZovikPOS`;

module.exports = {
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
  statusBadge,
  summaryBox,
  tokenBox,
  totalsTable,
};
