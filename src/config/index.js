require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  email: {
    account: {
      id: 'test-account',
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    imap: {
      host: process.env.IMAP_HOST || 'imap.qq.com',
      port: parseInt(process.env.IMAP_PORT) || 993,
    },
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.qq.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
    }
  },
  ai: {
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  }
};