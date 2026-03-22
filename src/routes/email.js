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

// 处理单封邮件
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

      // 2. 分类（调用分类Agent）
      const classification = classificationAgent.classifyEmail(email);
      logger.info(`邮件分类结果:`, classification);

      // 3. 更新邮件分类信息
      await prisma.inboxEmail.update({
        where: { id: emailId },
        data: {
          category: classification.category,
          priority: classification.priority,
          confidence: classification.confidence
        }
      });
      // 4. 检查是否已生成回复
      const existingReply = await prisma.outboxEmail.findFirst({
        where: { originalEmailId: emailId }
      });

      if (existingReply) {
        logger.info(`邮件 ${emailId} 已有回复，跳过处理`);
        return res.json({
          success: true,
          message: '邮件已处理过',
          email,
          classification,
          reply: {
            strategy: existingReply.generationType,
            content: existingReply.body,
            subject: existingReply.subject,
            outboxId: existingReply.id
          }
        });
      }
      // 4. 根据分类生成回复（调用回复Agent）
      const reply = await replyAgent.generateReply(email, classification);

      logger.info(`生成的回复策略: ${reply.strategy}`);

      // 5. 保存到发件箱
      let hasAttachment = false;
      let attachmentName = null;
      let attachmentInfo = null;

      console.log('========== 附件保存调试 ==========');
      console.log('reply.attachment 是否存在:', !!reply.attachment);

      if (reply.attachment) {
        console.log('reply.attachment 内容:', JSON.stringify(reply.attachment, null, 2));
        hasAttachment = true;
        attachmentName = reply.attachment.fileName;
        attachmentInfo = JSON.stringify(reply.attachment);
        console.log('设置后:', { hasAttachment, attachmentName, attachmentInfoLength: attachmentInfo?.length });
      }
      console.log('路由中接收到的 reply:', {
        hasAttachment: !!reply.attachment,
        attachmentType: reply.attachment?.type,
        attachmentFileName: reply.attachment?.fileName
      });
      const outboxData = {
        accountId: email.accountId,
        originalEmailId: emailId,
        toEmail: email.fromEmail,
        subject: reply.subject,
        body: reply.content,
        generationType: reply.strategy,
        confidence: classification.confidence,
        status: reply.strategy === 'human_review' ? 'manual' : 'pending',
        hasAttachment: hasAttachment,
        attachmentName: attachmentName,
        attachmentInfo: attachmentInfo
      };

      console.log('outboxData 附件字段:', {
        hasAttachment: outboxData.hasAttachment,
        attachmentName: outboxData.attachmentName,
        attachmentInfo: outboxData.attachmentInfo ? '存在' : '不存在'
      });


      const outbox = await prisma.outboxEmail.create({
        data: outboxData
      });

      // 只有成功创建发件箱记录，才标记邮件为已回复
      await prisma.inboxEmail.update({
        where: { id: emailId },
        data: { replyId: outbox.id }
      });
      console.log('路由中 reply 完整对象:', JSON.stringify(reply, null, 2));
      // 7. 返回结果
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
      logger.error('处理邮件失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

// 批量处理所有未处理邮件
router.post('/process-all', async (req, res) => {
  try {
    // 获取所有未分类或未回复的邮件
    const unprocessed = await prisma.inboxEmail.findMany({
      where: {
        OR: [
          { category: null },
          { isReplied: false }
        ],
        isArchived: false
      },
      take: 20  // 一次最多处理20封
    });

    logger.info(`找到 ${unprocessed.length} 封待处理邮件`);

    const results = [];
    for (const email of unprocessed) {
      try {
        // 调用单个处理接口
        const processRes = await fetch(`http://localhost:3000/api/email/process/${email.id}`, {
          method: 'POST'
        });
        const result = await processRes.json();
        results.push({
          id: email.id,
          subject: email.subject,
          success: true,
          result
        });
      } catch (err) {
        results.push({
          id: email.id,
          subject: email.subject,
          success: false,
          error: err.message
        });
      }
      // 稍微延迟，避免压力太大
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    res.json({
      success: true,
      processed: results.length,
      results
    });

  } catch (error) {
    logger.error('批量处理失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取系统状态统计
router.get('/stats', async (req, res) => {
  try {
    const [
      totalEmails,
      unprocessed,
      pendingReplies,
      sentToday
    ] = await Promise.all([
      prisma.inboxEmail.count(),
      prisma.inboxEmail.count({ where: { isReplied: false, isArchived: false } }),
      prisma.outboxEmail.count({ where: { status: 'pending' } }),
      prisma.outboxEmail.count({
        where: {
          status: 'sent',
          sentAt: {
            gte: new Date(new Date().setHours(0,0,0,0))
          }
        }
      })
    ]);

    res.json({
      totalEmails,
      unprocessed,
      pendingReplies,
      sentToday,
      categories: {
        // 可以再加个分类统计
        inquiry: await prisma.inboxEmail.count({ where: { category: 'inquiry' } }),
        complaint: await prisma.inboxEmail.count({ where: { category: 'complaint' } }),
        system_notice: await prisma.inboxEmail.count({ where: { category: 'system_notice' } }),
        security_alert: await prisma.inboxEmail.count({ where: { category: 'security_alert' } })
      }
    });
  } catch (error) {
    logger.error('获取统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;