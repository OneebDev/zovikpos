/**
 * Export data array to a downloadable CSV file
 * @param {string} filename - Desired CSV file name (e.g. "orders_export.csv")
 * @param {Array<Object>} data - Array of objects to export
 * @param {Array<{key: string, label: string}>} headers - Explicit header definitions
 */
export const exportToCSV = (filename, data, headers) => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user?.isDemo === true) {
      alert('🔒 Read-Only Demo Mode: File downloads and export features are disabled for demo accounts. Please log in with a real account to download files.');
      return;
    }
  } catch { /* Optional storage or parsing failure. */ }

  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const effectiveHeaders = headers || Object.keys(data[0]).map((k) => ({ key: k, label: k }));
  const headerRow = effectiveHeaders.map((h) => `"${String(h.label).replace(/"/g, '""')}"`).join(',');

  const rows = data.map((item) => {
    return effectiveHeaders
      .map((h) => {
        let val = item[h.key];
        if (val === null || val === undefined) val = '';
        else if (typeof val === 'object') val = JSON.stringify(val);
        // Spreadsheet apps may execute cells that begin with formula operators.
        // Prefix user-controlled text only; keep numeric values numeric.
        if (typeof val === 'string' && /^\s*[=+@-]/.test(val)) val = `'${val}`;
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  const csvContent = [headerRow, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename || 'export.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Print a clean, formatted report view as PDF
 * @param {string} title - Report Title
 * @param {string} contentHtml - HTML snippet representing report table/content
 */
export const printPDFReport = (title, contentHtml) => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user?.isDemo === true) {
      alert('🔒 Read-Only Demo Mode: PDF report exports are disabled for demo accounts. Please log in with a real account to export PDF reports.');
      return;
    }
  } catch { /* Optional storage or parsing failure. */ }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export PDF reports.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} - ZovikPOS AI POS</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; color: #0f172a; margin: 0; padding: 0; }
          .header { display: flex; justify-content: space-between; align-items: center; border-b: 2px solid #E85D2A; padding-bottom: 12px; margin-bottom: 20px; }
          .brand { display: flex; align-items: center; gap: 10px; font-size: 18pt; font-weight: 900; color: #E85D2A; letter-spacing: 1px; }
          .brand img { width: 38px; height: 38px; border-radius: 11px; }
          .subtitle { font-size: 9pt; color: #64748b; margin-top: 2px; }
          .meta { text-align: right; font-size: 9pt; color: #64748b; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: 700; text-align: left; font-size: 9pt; color: #334155; }
          td { border: 1px solid #e2e8f0; padding: 7px 10px; font-size: 9pt; color: #0f172a; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .footer { margin-top: 30px; border-t: 1px solid #e2e8f0; pt: 10px; text-align: center; font-size: 8pt; color: #94a3b8; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: bold; background: #e2e8f0; }
          .badge-success { background: #dcfce7; color: #166534; }
          .badge-warning { background: #fef3c7; color: #92400e; }
          .badge-danger { background: #fee2e2; color: #991b1b; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand"><img src="${window.location.origin}/assets/zovikpos-mark.svg" alt="" /> ZOVIKPOS</div>
            <div class="subtitle">${title} • University Canteen Management System</div>
          </div>
          <div class="meta">
            <div><strong>Generated Date:</strong> ${new Date().toLocaleString()}</div>
            <div><strong>System User:</strong> Administrator</div>
          </div>
        </div>

        <div class="content">
          ${contentHtml}
        </div>

        <div class="footer">
          Confidential • Generated automatically by ZovikPOS Enterprise POS • Page 1 of 1
        </div>

        <script>
          window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};
