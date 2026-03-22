const IMAPClient = require('../tools/imapClient');
const SMTPClient = require('../tools/smtpClient');
const prisma = require('../models/prisma');
const config = require('../config');
const logger = require('../tools/logger');

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
    try {
      console.log('\n========== 开始检查新邮件 ==========');
      const emails = await this.imap.fetchUnread(limit);
      console.log(`📨 fetchUnread 返回 ${emails.length} 封邮件`);
      
      if (emails.length === 0) {
        console.log('📭 没有新邮件');
        return [];
      }
      
      // 打印每封邮件的详细信息
      // emails.forEach((email, index) => {
      //   console.log(`\n--- 邮件 ${index + 1} ---`);
      //   console.log('messageId:', email.messageId);
      //   console.log('fromEmail:', email.fromEmail);
      //   console.log('subject:', email.subject);
      //   console.log('hasBody:', !!email.body);
      //   console.log('receivedAt:', email.receivedAt);
      // });
      
      const saved = [];
      for (const email of emails) {
        // console.log(`\n处理邮件: ${email.subject}`);
        
        // 检查是否已存在
        const existing = await prisma.inboxEmail.findUnique({
          where: { messageId: email.messageId }
        });
        
        if (existing) {
          // console.log(`⏭️ 邮件已存在，ID: ${existing.id}`);
          continue;
        }
        
        // 准备保存数据
        const emailData = {
          accountId: config.email.account.id,
          messageId: email.messageId,
          fromEmail: email.fromEmail,
          fromName: email.fromName || '',
          toEmail: 'support@myagent.com',
          subject: email.subject,
          body: email.body || '',
          bodyHtml: email.bodyHtml || null,
          receivedAt: email.receivedAt || new Date()
        };
        
        console.log('准备保存数据:', {
          messageId: emailData.messageId,
          subject: emailData.subject,
          from: emailData.fromEmail
        });
        
        try {
          const savedEmail = await prisma.inboxEmail.create({
            data: emailData
          });
          saved.push(savedEmail);
          console.log(`✅ 保存成功! ID: ${savedEmail.id}`);
        } catch (dbError) {
          console.error('❌ 数据库保存失败:', {
            code: dbError.code,
            message: dbError.message,
            meta: dbError.meta
          });
        }
      }
      
      console.log(`\n📊 本次检查结束，新保存 ${saved.length} 封邮件`);
      console.log('========== 检查结束 ==========\n');
      return saved;
    } catch (err) {
      console.error('❌ 检查邮件失败:', err);
      throw err;
    }
  }

  async sendEmail(outboxId) {
    const outbox = await prisma.outboxEmail.findUnique({
      where: { id: outboxId },
      include: { account: true }
    });
    console.log('发送邮件的内容为：',outbox);
    
    if (!outbox) throw new Error(`发件邮件 ${outboxId} 不存在`);
  
    let attachments = [];
    let tempFileInfo = null;
  
    // 如果邮件需要生成附件
    // console.log('是否需要生成附件：',outbox,outbox.hasAttachment , outbox.attachmentInfo);
    
    if (outbox.hasAttachment && outbox.attachmentInfo) {
      try {
        const fileGenerator = require('../tools/fileGenerator');
        
        // 解析附件信息
        let attachmentInfo;
        try {
          attachmentInfo = JSON.parse(outbox.attachmentInfo);
        } catch (parseErr) {
          logger.error('附件信息解析失败:', parseErr);
          throw new Error('附件信息格式错误');
        }
        
        // console.log('附件信息:', attachmentInfo);
        
        // 验证必要字段
        if (!attachmentInfo.type || !attachmentInfo.fileName) {
          throw new Error('附件信息不完整');
        }
    
        tempFileInfo = await fileGenerator.generateFile(attachmentInfo);
        console.log('生成的文件:', tempFileInfo);
        
        attachments.push({
          filename: tempFileInfo.fileName,
          path: tempFileInfo.path,
          contentType: tempFileInfo.mimeType
        });
      } catch (fileErr) {
        logger.error('附件生成失败:', fileErr);
        // 附件生成失败，但邮件仍然发送，只是不带附件
      }
    }
  
    try {
      const mailOptions = {
        from: `"AI邮件助手" <${this.smtp.transporter.options.auth.user}>`,
        to: outbox.toEmail,
        subject: outbox.subject,
        text: outbox.body,
        html: outbox.bodyHtml || outbox.body,
        attachments
      };
  
      const info = await this.smtp.transporter.sendMail(mailOptions);
  
      await prisma.outboxEmail.update({
        where: { id: outboxId },
        data: { 
          status: 'sent', 
          sentAt: new Date(),
          attachmentPath: tempFileInfo?.path,
          attachmentName: tempFileInfo?.fileName
        }
      });
  
      // 清理临时文件
      if (tempFileInfo) {
        const fileGenerator = require('../tools/fileGenerator');
        fileGenerator.cleanup(tempFileInfo.path);
      }
  
      if (outbox.originalEmailId) {
        await prisma.inboxEmail.update({
          where: { id: outbox.originalEmailId },
          data: { isReplied: true }
        });
      }
  
      logger.info(`邮件发送成功: ${outboxId}`);
      return info;
    } catch (err) {
      if (tempFileInfo) {
        const fileGenerator = require('../tools/fileGenerator');
        fileGenerator.cleanup(tempFileInfo.path);
      }
      
      await prisma.outboxEmail.update({
        where: { id: outboxId },
        data: { status: 'failed', errorMessage: err.message }
      });
      logger.error(`邮件发送失败: ${outboxId}`, err);
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
      console.log('✅ 1. 调用回复 Agent 执行完毕');
      console.log('✅ 2. Agent回复为：',reply);
      if (reply.attachment) {
        console.log('✅ 3. Agent回复的内容:', JSON.stringify(reply.attachment, null, 2));
      }
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