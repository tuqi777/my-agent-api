const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { emailTools } = require('../utils/emailTools');
const cron = require('node-cron');

const router = express.Router();
const prisma = new PrismaClient();

// ============ 手动触发检查新邮件 ============
router.post('/check', async (req, res) => {
    try {
      const { accountId = 'test-account', limit = 5 } = req.body;
      
      // 1. 获取新邮件 - 直接调用函数，不通过 tools 数组
      const fetchTool = emailTools.find(t => t.function.name === 'fetchNewEmails');
      if (!fetchTool) {
        throw new Error('fetchNewEmails 工具未找到');
      }
      
      const newEmails = await fetchTool.execute({ accountId, limit });
      console.log('获取到新邮件:', newEmails.length);
      
      // 2. 保存到收件箱
      const savedEmails = [];
      for (const email of newEmails) {
        // 检查是否已存在
        const existing = await prisma.inboxEmail.findUnique({
          where: { messageId: email.messageId }
        });
        
        if (!existing) {
          const saved = await prisma.inboxEmail.create({
            data: {
              accountId,
              messageId: email.messageId,
              fromEmail: email.fromEmail,
              fromName: email.fromName,
              toEmail: 'support@myagent.com',
              subject: email.subject,
              body: email.body,
              receivedAt: email.receivedAt || new Date()
            }
          });
          savedEmails.push(saved);
          console.log(`✅ 邮件已保存: ${email.subject}`);
        } else {
          console.log(`⏭️ 邮件已存在，跳过: ${email.subject}`);
        }
      }
      
      res.json({
        success: true,
        checked: newEmails.length,
        new: savedEmails.length,
        emails: savedEmails
      });
      
    } catch (error) {
      console.error('检查邮件失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

// ============ 处理单封邮件 ============
router.post('/process/:emailId', async (req, res) => {
  try {
    const { emailId } = req.params;
    
    // 1. 获取邮件
    const email = await prisma.inboxEmail.findUnique({
      where: { id: emailId }
    });
    
    if (!email) {
      return res.status(404).json({ error: '邮件不存在' });
    }
    
    // 2. 分类
    const classifyTool = emailTools.find(t => t.function.name === 'classifyEmail');
    const classification = await classifyTool.execute({
      subject: email.subject,
      body: email.body,
      fromEmail: email.fromEmail
    });
    
    // 3. 更新分类
    await prisma.inboxEmail.update({
      where: { id: emailId },
      data: {
        category: classification.category,
        priority: classification.priority,
        confidence: classification.confidence
      }
    });
    
    // 4. 生成回复
    const generateTool = emailTools.find(t => t.function.name === 'generateReply');
    const reply = await generateTool.execute({
      originalEmail: email,
      category: classification.category
    });
    
    // 5. 保存到发件箱
    const saveTool = emailTools.find(t => t.function.name === 'saveReply');
    const outbox = await saveTool.execute({
      originalEmailId: emailId,
      toEmail: email.fromEmail,
      subject: reply.subject,
      body: reply.content,
      generationType: reply.strategy,
      confidence: classification.confidence
    });
    
    res.json({
      success: true,
      email,
      classification,
      reply: {
        ...reply,
        outboxId: outbox.id
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 发送待处理邮件 ============
router.post('/send-pending', async (req, res) => {
  try {
    const pending = await prisma.outboxEmail.findMany({
      where: { status: 'pending' },
      take: 10
    });
    
    const results = [];
    const sendTool = emailTools.find(t => t.function.name === 'sendRealEmail');
    
    for (const outbox of pending) {
      const result = await sendTool.execute({ outboxId: outbox.id });
      results.push(result);
    }
    
    res.json({
      success: true,
      sent: results.length,
      results
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 查看收件箱 ============
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
    res.status(500).json({ error: error.message });
  }
});

// ============ 查看发件箱 ============
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
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;