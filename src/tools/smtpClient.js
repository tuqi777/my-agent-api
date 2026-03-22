const nodemailer = require('nodemailer');

class SMTPClient {
  constructor(config) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.pass
      },
      tls: { rejectUnauthorized: false }
    });
  }

  async send(to, subject, text, html = null) {
    const info = await this.transporter.sendMail({
      from: `"AI邮件助手" <${this.transporter.options.auth.user}>`,
      to,
      subject,
      text,
      html: html || text
    });
    return info;
  }

  async verify() {
    return await this.transporter.verify();
  }
}

module.exports = SMTPClient;