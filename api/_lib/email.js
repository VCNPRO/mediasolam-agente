import nodemailer from "nodemailer";

export function buildEmailHtml(oportunidades) {
  const fecha = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const rows = oportunidades
    .map(
      (op) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
          <a href="${op.link}" style="color:#2563eb;text-decoration:none;font-weight:600;">${op.titulo}</a>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
          <span style="background:#dbeafe;color:#1e40af;padding:4px 10px;border-radius:4px;font-size:13px;font-weight:600;">${op.Aplicacion_Mediasolam}</span>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;">${op.Nivel_de_Encaje}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${op.Presupuesto_Estimado}</td>
      </tr>
      <tr>
        <td colspan="4" style="padding:8px 16px 16px;border-bottom:2px solid #e5e7eb;background:#f9fafb;">
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;font-weight:600;">Resumen Ejecutivo</p>
          <p style="margin:0 0 10px;font-size:14px;color:#374151;">${op.Resumen_Ejecutivo}</p>
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;font-weight:600;">Ángulo de Venta</p>
          <p style="margin:0;font-size:14px;color:#374151;">${op.Angulo_de_Venta}</p>
        </td>
      </tr>`
    )
    .join("");

  return `
  <!DOCTYPE html>
  <html lang="es">
  <head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:720px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:22px;">Nuevas Licitaciones Detectadas</h1>
        <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">${fecha} · ${oportunidades.length} oportunidad${oportunidades.length > 1 ? "es" : ""}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Licitación</th>
            <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">App</th>
            <th style="padding:12px 16px;text-align:center;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Encaje</th>
            <th style="padding:12px 16px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Presupuesto</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="padding:24px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Generado automáticamente por <strong>Agente Licitaciones</strong> · VCNpro AI</p>
      </div>
    </div>
  </body>
  </html>`;
}

export async function sendEmail(oportunidades, recipients) {
  const to = recipients && recipients.length > 0
    ? recipients.join(", ")
    : process.env.EMAIL_TO;

  if (!to) {
    console.log("No email recipients configured, skipping email");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Agente Licitaciones" <${process.env.SMTP_USER}>`,
    to,
    subject: `[VCNpro AI] ${oportunidades.length} nueva${oportunidades.length > 1 ? "s" : ""} licitacion${oportunidades.length > 1 ? "es" : ""}`,
    html: buildEmailHtml(oportunidades),
  });

  return true;
}
