const express = require('express');
const emailService = require('../services/emailService');
const prisma = require('../models/prisma');
const logger = require('../tools/logger');

const classificationAgent = require('../agents/classificationAgent');
const replyAgent = require('../agents/replyAgent');

const router = express.Router();

// 检查新邮件
router.post('/check', async (req, res) => {
  try {
    const { limit = 5 } = req.body;
    const newEmails = await emailService.checkNewEmails(limit);
    
    res.json({
      success: true,
      checked: newEmails.length,
      new: newEmails.length,
      emails: newEmails
    });
  } catch (error) {
    logger.error('检查邮件失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看收件箱
router.get('/inbox', async (req, res) => {
  try {
    const { category, limit = 50 } = req.query;
    
    const where = {};
    if (category) where.category = category;
    
    const emails = await prisma.inboxEmail.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: parseInt(limit),
      include: {
        reply: true
      }
    });
    
    res.json(emails);
  } catch (error) {
    logger.error('获取收件箱失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看发件箱
router.get('/outbox', async (req, res) => {
  try {
    const { status } = req.query;
    
    const where = {};
    if (status) where.status = status;
    
    const emails = await prisma.outboxEmail.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        originalEmail: true
      }
    });
    
    res.json(emails);
  } catch (error) {
    logger.error('获取发件箱失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 发送待处理邮件
router.post('/send-pending', async (req, res) => {
  try {
    const pending = await prisma.outboxEmail.findMany({
      where: { status: 'pending' },
      take: 10
    });
    
    const results = [];
    for (const outbox of pending) {
      try {
        const result = await emailService.sendEmail(outbox.id);
        results.push({ id: outbox.id, success: true, result });
      } catch (err) {
        results.push({ id: outbox.id, success: false, error: err.message });
      }
    }
    
    res.json({
      success: true,
      sent: results.filter(r => r.success).length,
      results
    });
  } catch (error) {
    logger.error('批量发送失败:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;