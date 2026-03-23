const IMAPClient = require('../tools/imapClient');
const SMTPClient = require('../tools/smtpClient');
const prisma = require('../models/prisma');
const config = require('../config');
const logger = require('../tools/logger');
const { retry, sleep, withTimeout } = require('../tools/retry');
class EmailService {
  constructor() {
    this.imap = new IMAPClient({
      user: config.email.account.user,
      password: config.email.account.pass,
      host: config.email.imap.host,
      port: config.email.imap.port
    });
    this.smtp = new SMTPClient({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      user: config.email.account.user,
      pass: config.email.account.pass
    });
  }

  async checkNewEmails(limit = 10) {
    return retry(
      async () => {
        logger.info('开始检查新邮件', { limit });
        const emails = await this.imap.fetchUnread(limit);
        logger.info(`获取到 ${emails.length} 封邮件`);
        
        const saved = [];
        for (const email of emails) {
          const existing = await prisma.inboxEmail.findUnique({
            where: { messageId: email.messageId }
          });
          
          if (!existing) {
            const savedEmail = await prisma.inboxEmail.create({
              data: {
                accountId: config.email.account.id,
                ...email,
                toEmail: 'support@myagent.com'
              }
            });
            saved.push(savedEmail);
            // logger.info(`邮件已保存: ${email.subject}`, { messageId: email.messageId });
          }
        }
        return saved;
      },
      {
        maxRetries: 2,
        delay: 2000,
        onError: (attempt, error) => {
          logger.warn(`检查邮件失败 (${attempt}/2)`, { error: error.message });
        }
      }
    );
  }
  async sendEmail(outboxId) {
    const outbox = await prisma.outboxEmail.findUnique({
      where: { id: outboxId },
      include: { account: true }
    });
    
    if (!outbox) throw new Error(`发件邮件 ${outboxId} 不存在`);
  
    let attachments = [];
    let tempFileInfo = null;
  
    // 附件生成（带超时）
    if (outbox.hasAttachment && outbox.attachmentInfo) {
      try {
        const fileGenerator = require('../tools/fileGenerator');
        const attachmentInfo = JSON.parse(outbox.attachmentInfo);
        
        // 附件生成超时控制（30秒）
        tempFileInfo = await withTimeout(
          fileGenerator.generateFile(attachmentInfo),
          30000,
          '附件生成超时'
        );
        
        attachments.push({
          filename: tempFileInfo.fileName,
          path: tempFileInfo.path,
          contentType: tempFileInfo.mimeType
        });
        
        logger.info(`附件生成成功: ${tempFileInfo.fileName}`);
        
      } catch (fileErr) {
        logger.error('附件生成失败', { error: fileErr.message, outboxId });
        
        // 更新重试计数
        const newRetryCount = (outbox.retryCount || 0) + 1;
        const maxRetries = outbox.maxRetries || 3;
        const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000);
        
        await prisma.outboxEmail.update({
          where: { id: outboxId },
          data: {
            status: 'failed',
            retryCount: newRetryCount,
            lastError: fileErr.message,
            nextRetryAt: newRetryCount < maxRetries ? nextRetryAt : null,
            errorMessage: fileErr.message
          }
        });
        
        throw fileErr;
      }
    }
  
    // 邮件发送（带重试）
    try {
      const mailOptions = {
        from: `"AI邮件助手" <${this.smtp.transporter.options.auth.user}>`,
        to: outbox.toEmail,
        subject: outbox.subject,
        text: outbox.body,
        html: outbox.bodyHtml || outbox.body,
        attachments
      };
  
      const info = await retry(
        async () => await this.smtp.transporter.sendMail(mailOptions),
        {
          maxRetries: 2,
          delay: 3000,
          onError: (attempt, error) => {
            logger.warn(`邮件发送失败 (${attempt}/2)`, { outboxId, error: error.message });
          }
        }
      );
  
      await prisma.outboxEmail.update({
        where: { id: outboxId },
        data: { 
          status: 'sent', 
          sentAt: new Date(),
          attachmentPath: tempFileInfo?.path,
          attachmentName: tempFileInfo?.fileName,
          retryCount: 0,
          lastError: null,
          nextRetryAt: null
        }
      });
  
      logger.info(`邮件发送成功`, { outboxId, hasAttachment: attachments.length > 0 });
      
      return info;
    } catch (err) {
      logger.error(`邮件发送最终失败`, { outboxId, error: err.message });
      throw err;
    }
  }
  async processEmail(emailId) {
    try {
      // 1. 获取邮件
      const email = await prisma.inboxEmail.findUnique({
        where: { id: emailId }
      });
      
      if (!email) throw new Error(`邮件 ${emailId} 不存在`);
      
      // 2. 调用分类 Agent
      const classificationAgent = require('../agents/classificationAgent');
      const classification = classificationAgent.classifyEmail(email);
      
      // 3. 更新分类
      await prisma.inboxEmail.update({
        where: { id: emailId },
        data: {
          category: classification.category,
          priority: classification.priority,
          confidence: classification.confidence
        }
      });
      
      // 4. 调用回复 Agent
      const replyAgent = require('../agents/replyAgent');
      const reply = await replyAgent.generateReply(email, classification);
      // console.log('✅ 1. 调用回复 Agent 执行完毕');
      // console.log('✅ 2. Agent回复为：',reply);
      // if (reply.attachment) {
        // console.log('✅ 3. Agent回复的内容:', JSON.stringify(reply.attachment, null, 2));
      // }
      // 5. 保存到发件箱
      const outboxData = {
        accountId: email.accountId,
        originalEmailId: emailId,
        toEmail: email.fromEmail,
        subject: reply.subject,
        body: reply.content,
        generationType: reply.strategy,
        confidence: classification.confidence,
        status: reply.strategy === 'human_review' ? 'manual' : 'pending'
      };
      
      // 👇 添加附件字段（如果存在）
      if (reply.attachment) {
        outboxData.hasAttachment = true;
        outboxData.attachmentName = reply.attachment.fileName;
        outboxData.attachmentInfo = JSON.stringify(reply.attachment);
      }
      const outbox = await prisma.outboxEmail.create({
        data: outboxData
      });
      
      logger.info(`邮件 ${emailId} 处理完成，回复已存入发件箱`);
      return outbox;
      
    } catch (err) {
      logger.error(`处理邮件 ${emailId} 失败:`, err);
      throw err;
    }
  }
}

module.exports = new EmailService();