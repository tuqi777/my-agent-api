const nodemailer = require('nodemailer');

class RealEmailSender {
  constructor(config) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465, // 465端口用secure，587用STARTTLS [citation:4]
      auth: {
        user: config.user,
        pass: config.password
      },
      tls: {
        rejectUnauthorized: false // 避免自签名证书错误
      }
    });
  }

  // 发送邮件
  async sendEmail({ to, subject, text, html, attachments = [] }) {
    try {
      const mailOptions = {
        from: `"AI邮件助手" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html: html || text,
        attachments
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('邮件发送成功:', info.messageId);
      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
    } catch (error) {
      console.error('邮件发送失败:', error);
      throw error;
    }
  }

  // 验证连接
  async verify() {
    try {
      await this.transporter.verify();
      console.log('SMTP服务器连接正常');
      return true;
    } catch (error) {
      console.error('SMTP服务器连接失败:', error);
      return false;
    }
  }
}

module.exports = RealEmailSender;