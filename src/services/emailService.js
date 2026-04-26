const nodemailer = require("nodemailer");
const env = require("../config/env");
const HttpError = require("../utils/httpError");

class EmailService {
  constructor() {
    this.transporter = null;
    this.ready = false;
    this.smtpEnabled = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass && env.smtp.from);
  }

  async ensureTransport() {
    if (this.ready || !this.smtpEnabled) {
      return;
    }
    this.transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    });
    await this.transporter.verify();
    this.ready = true;
  }

  async sendVerificationEmail({ email, name, token }) {
    if (!this.smtpEnabled) {
      if (env.isProductionMode && env.nodeEnv !== "test") {
        throw new HttpError(503, "Email service is not configured for production mode");
      }
      return;
    }

    await this.ensureTransport();
    const verifyUrl = `${env.publicAppUrl}/?verify_email=${encodeURIComponent(email)}&verify_token=${encodeURIComponent(token)}`;
    await this.transporter.sendMail({
      from: env.smtp.from,
      to: email,
      subject: "Verify your TaskFlow account",
      text: `Hi ${name}, verify your account: ${verifyUrl}`,
      html: `<p>Hi ${name},</p><p>Verify your TaskFlow account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    });
  }
}

module.exports = EmailService;
