require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const config = require('./src/config');
const logger = require('./src/tools/logger');
const emailRoutes = require('./src/routes/email');
const Imap = require('imap');
const { PrismaClient } = require('@prisma/client');
const app = express();
const PORT = config.server.port;

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// 路由
app.use('/api/email', emailRoutes);

// 健康检查接口
const prisma = new PrismaClient();  // 确保这行在健康检查之前
app.get('/health', async (req, res) => {
  const checks = {
    server: { status: 'ok', uptime: process.uptime() },
    database: { status: 'unknown' },
    imap: { status: 'unknown' },
    bilibili: { status: 'unknown' }
  };
  
  let overallStatus = 200;
  
  // 检查数据库 - 使用已定义的 prisma
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok' };
  } catch (err) {
    checks.database = { status: 'error', error: err.message };
    overallStatus = 503;
  }
  
  // 检查 IMAP - 使用已定义的 Imap
  try {
    const imapTest = new Imap({
      user: config.email.account.user,
      password: config.email.account.pass,
      host: config.email.imap.host,
      port: config.email.imap.port,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        imapTest.end();
        reject(new Error('连接超时'));
      }, 10000);
      
      imapTest.once('ready', () => {
        clearTimeout(timeout);
        imapTest.end();
        resolve();
      });
      imapTest.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      imapTest.connect();
    });
    checks.imap = { status: 'ok' };
  } catch (err) {
    checks.imap = { status: 'error', error: err.message };
    overallStatus = 503;
  }
  
  // 检查 B站 API
  try {
    const bilibiliAPI = require('./src/tools/bilibiliAPI');
    const result = await bilibiliAPI.searchUser('王师傅');
    checks.bilibili = { status: 'ok', hasResult: !!result };
  } catch (err) {
    checks.bilibili = { status: 'error', error: err.message };
  }
  
  res.status(overallStatus).json({
    status: overallStatus === 200 ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks
  });
});

// 统计接口
app.get('/api/stats', async (req, res) => {
  try {
    const [totalEmails, pending, sent, failed] = await Promise.all([
      prisma.inboxEmail.count(),
      prisma.outboxEmail.count({ where: { status: 'pending' } }),
      prisma.outboxEmail.count({ where: { status: 'sent' } }),
      prisma.outboxEmail.count({ where: { status: 'failed' } })
    ]);
    
    res.json({
      totalEmails,
      pending,
      sent,
      failed,
      successRate: totalEmails > 0 ? (sent / totalEmails * 100).toFixed(2) : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 定时任务：每分钟检查新邮件
cron.schedule('*/1 * * * *', async () => {
  logger.info('开始定时检查邮件');
  try {
    const emailService = require('./src/services/emailService');
    const newEmails = await emailService.checkNewEmails(100);

    if (newEmails.length > 0) {
      logger.info(`发现 ${newEmails.length} 封新邮件，开始处理...`);
      
      // ===== 第2步：处理每封新邮件 =====
      for (const email of newEmails) {
        try {
          // 调用内部的 process 逻辑（需要你暴露一个方法）
          // 这里有两种方式：
          
          // 方式A：直接调用 service 里的处理方法（推荐）
          await emailService.processEmail(email.id);
          
          // 方式B：通过 HTTP 调用自己（如果不想改 service）
          // await fetch(`http://localhost:3000/api/email/process/${email.id}`, { method: 'POST' });
          
          logger.info(`邮件处理成功: ${email.id}`);
        } catch (processErr) {
          logger.error(`邮件处理失败: ${email.id}`, processErr);
        }
        // 稍微延迟，避免并发太高
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // ===== 第3步：发送待处理回复 =====
      const sendRes = await fetch('http://localhost:3000/api/email/send-pending', {
        method: 'POST'
      });
      const sendResult = await sendRes.json();
      logger.info(`已发送 ${sendResult.sent} 封回复邮件`);
      
    } else {
      logger.info('没有新邮件需要处理');
    }

  } catch (err) {
    logger.error('定时任务失败:', err);
  }
});

// 启动服务器
const server = app.listen(PORT, () => {
  logger.info(`服务器运行在 http://localhost:${PORT}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，正在关闭...');
  server.close(async () => {
    const prisma = require('./src/models/prisma');
    await prisma.$disconnect();
    process.exit(0);
  });
});

module.exports = server;