import { NextResponse } from "next/server";

import nodemailer from "nodemailer";

type ReplyPayload = {
  toEmail: string;
  userName?: string;
  message: string;
  recommendedProducts?: string[];
  recommendedPackages?: Array<{
    name: string;
    items: string[];
    totalPrice: number;
    currency: "RON" | "EUR";
  }>;
};

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !port || !user || !pass || !from) {
    throw new Error("SMTP config missing. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM");
  }
  return {
    host,
    port: Number(port),
    user,
    pass,
    from,
  };
};

const buildEmailHtml = (payload: ReplyPayload) => {
  const recommendedProducts = payload.recommendedProducts?.length
    ? `<ul>${payload.recommendedProducts.map((item) => `<li>${item}</li>`).join("")}</ul>`
    : "<p>Momentan nu au fost selectate produse recomandate.</p>";
  const recommendedPackages = payload.recommendedPackages?.length
    ? `<ul>${payload.recommendedPackages
        .map(
          (item) =>
            `<li><strong>${item.name}</strong> — ${item.totalPrice} ${item.currency}<ul>${item.items
              .map((entry) => `<li>${entry}</li>`)
              .join("")}</ul></li>`,
        )
        .join("")}</ul>`
    : "<p>Momentan nu au fost selectate pachete recomandate.</p>";
  const recommendedSection = payload.recommendedPackages?.length
    ? `<h4>Pachete recomandate</h4>${recommendedPackages}`
    : `<h4>Produse recomandate</h4>${recommendedProducts}`;
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>Bună${payload.userName ? `, ${payload.userName}` : ""}!</p>
      <p>Avem un răspuns din partea specialistului:</p>
      <div style="margin: 16px 0; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
        ${payload.message.replace(/\n/g, "<br/>")}
      </div>
      ${recommendedSection}
      <p style="margin-top: 16px;">Mulțumim!</p>
    </div>
  `;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ReplyPayload;
    if (!payload.toEmail || !payload.message) {
      return NextResponse.json({ error: "Missing toEmail or message." }, { status: 400 });
    }
    const smtp = getSmtpConfig();
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });
    await transporter.sendMail({
      from: smtp.from,
      to: payload.toEmail,
      subject: "Răspuns recomandare specialist",
      html: buildEmailHtml(payload),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error ?? "Email send failed.") }, { status: 500 });
  }
}
