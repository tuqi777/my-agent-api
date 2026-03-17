const { PrismaClient } = require('@prisma/client');
const { tools: existingTools } = require('./tools');
const { askWithRAG } = require('./rag'); // 复用RAG
const RealEmailReceiver = require('./realEmailReceiver');
const RealEmailSender = require('./realEmailSender');

const prisma = new PrismaClient();

// ============ 模拟IMAP收邮件（先用本地测试数据） ============
// 修改参数为对象形式，以匹配调用方式
// async function fetchNewEmails({ accountId, limit = 5 }) {
//     console.log(`📨 获取新邮件: accountId=${accountId}, limit=${limit}`);
    
//     // 模拟数据
//     const mockEmails = [
//       {
//         messageId: `mock-${Date.now()}-1`,
//         fromEmail: 'customer1@example.com',
//         fromName: '张三',
//         subject: '咨询产品价格',
//         body: '请问你们的AI Agent开发平台多少钱？有免费试用吗？',
//         receivedAt: new Date()
//       },
//       {
//         messageId: `mock-${Date.now()}-2`,
//         fromEmail: 'customer2@example.com',
//         fromName: '李四',
//         subject: '订单状态查询',
//         body: '我上周下的订单#12345，什么时候能发货？',
//         receivedAt: new Date()
//       },
//       {
//         messageId: `mock-${Date.now()}-3`,
//         fromEmail: 'complaint@example.com',
//         fromName: '王五',
//         subject: '服务投诉',
//         body: '你们的产品太差了，我要退款！',
//         receivedAt: new Date()
//       }
//     ];
    
//     return mockEmails;
//   }

// ============ 真实IMAP接收邮件 ============
async function fetchNewEmails({ accountId, limit = 5 }) {
    console.log(`📨 从真实邮箱获取新邮件: accountId=${accountId}, limit=${limit}`);
    
    try {
      // 从数据库获取邮箱账户配置
      const account = await prisma.emailAccount.findUnique({
        where: { id: accountId }
      });
  
      if (!account) {
        throw new Error(`邮箱账户 ${accountId} 不存在`);
      }
  
      // 动态导入 imap（避免启动时加载）
      const Imap = require('imap');
      const { simpleParser } = require('mailparser');
      
      return new Promise((resolve, reject) => {
        const emails = [];
        let messageCount = 0;  // 👈 添加这一行
        
        const imap = new Imap({
          user: account.username,
          password: account.password,
          host: account.imapHost,
          port: account.imapPort,
          tls: true,
          tlsOptions: { rejectUnauthorized: false }
        });
  
        imap.once('ready', () => {
          console.log('IMAP连接成功，打开收件箱...');
          imap.openBox('INBOX', false, (err, box) => {
            if (err) {
              reject(err);
              return;
            }
  
            // 搜索未读邮件
            imap.search(['UNSEEN'], (err, results) => {
              if (err) {
                reject(err);
                return;
              }
              
              if (!results || !results.length) {
                console.log('没有新邮件');
                imap.end();
                resolve([]);
                return;
              }
  
              console.log(`找到 ${results.length} 封未读邮件，获取前 ${limit} 封`);
              
              // 限制获取数量
              const fetchResults = results.slice(0, limit);
              
              const fetch = imap.fetch(fetchResults, {
                bodies: '',
                struct: true
              });

              fetch.on('message', (msg, seqno) => {
                let emailData = '';
                messageCount++
                msg.on('body', (stream) => {
                  stream.on('data', (chunk) => {
                    emailData += chunk.toString('utf8');
                  });
                });
  
                msg.once('end', async () => {
                  try {
                    const parsed = await simpleParser(emailData);
                    
                     // 添加调试信息
                    // console.log('📧 解析邮件:', {
                    //   messageId: parsed.messageId,
                    //   from: parsed.from?.value[0]?.address,
                    //   subject: parsed.subject,
                    //   hasBody: !!parsed.text,
                    //   date: parsed.date
                    // });

                    // 只有在必要字段存在时才添加
                    if (parsed.from?.value[0]?.address && parsed.subject) {
                      emails.push({
                        messageId: parsed.messageId || `msg-${Date.now()}-${seqno}`,
                        fromEmail: parsed.from.value[0].address,
                        fromName: parsed.from.value[0].name || '',
                        subject: parsed.subject,
                        body: parsed.text || '',
                        bodyHtml: parsed.html || '',
                        receivedAt: parsed.date || new Date()
                      });
                      console.log(`✅ 第 ${messageCount} 封邮件解析成功，已添加到数组`); // 👈 添加成功日志
                    } else {
                      console.log(`⚠️ 第 ${messageCount} 封邮件缺少必要字段，已跳过`); // 👈 添加跳过日志
                    }
                  } catch (parseErr) {
                    console.error(`❌ 第 ${messageCount} 封邮件解析失败:`, parseErr);
                  }
                });
              });
  
              fetch.once('end', () => {
                imap.end();
                setTimeout(() => {
                  imap.end();
                  console.log(`📊 最终统计: 共收到 ${messageCount} 封邮件流`);
                  console.log(`✅ 成功解析并保存: ${emails.length} 封`);
                  console.log(`❌ 解析失败/跳过: ${messageCount - emails.length} 封`);
                  resolve(emails);
                }, 1000);
              });
  
              fetch.once('error', (err) => {
                reject(err);
              });
            });
          });
        });
  
        imap.once('error', (err) => {
          console.error('IMAP错误:', err);
          reject(err);
        });
  
        imap.once('end', () => {
          console.log('IMAP连接关闭');
        });
  
        imap.connect();
      });
  
    } catch (error) {
      console.error('获取真实邮件失败:', error);
      
      // 降级：返回模拟数据（用于开发测试）
      console.log('⚠️ 使用模拟邮件数据');
      const mockEmails = [
        {
          messageId: `mock-${Date.now()}-1`,
          fromEmail: 'customer1@example.com',
          fromName: '张三',
          subject: '咨询产品价格',
          body: '请问你们的AI Agent开发平台多少钱？有免费试用吗？',
          receivedAt: new Date()
        },
        {
          messageId: `mock-${Date.now()}-2`,
          fromEmail: 'customer2@example.com',
          fromName: '李四',
          subject: '订单状态查询',
          body: '我上周下的订单#12345，什么时候能发货？',
          receivedAt: new Date()
        },
        {
          messageId: `mock-${Date.now()}-3`,
          fromEmail: 'complaint@example.com',
          fromName: '王五',
          subject: '服务投诉',
          body: '你们的产品太差了，我要退款！',
          receivedAt: new Date()
        }
      ];
      
      return mockEmails;
    }
  }


// ============ 工具1：邮件分类 ============
async function classifyEmail({ subject, body, fromEmail }) {
  // 简单规则 + AI分类
  const text = `${subject} ${body}`.toLowerCase();
  
  let category = 'inquiry';
  let confidence = 0.8;
  
  if (text.includes('订单') || text.includes('发货') || text.includes('物流')) {
    category = 'order';
  } else if (text.includes('投诉') || text.includes('退款') || text.includes('差')) {
    category = 'complaint';
  } else if (text.includes('价格') || text.includes('多少钱') || text.includes('试用')) {
    category = 'inquiry';
  } else if (text.includes('合作') || text.includes('代理')) {
    category = 'business';
  }
  
  return {
    category,
    confidence,
    priority: category === 'complaint' ? 5 : (category === 'order' ? 3 : 1)
  };
}

// ============ 工具2：根据分类选择回复策略 ============
async function generateReply({ originalEmail, category }) {
  const { subject, body, fromName, fromEmail } = originalEmail;
  
  let replyContent = '';
  let strategy = '';
  
  switch(category) {
    case 'inquiry':
      // 用模板回复
      strategy = 'template';
      replyContent = `您好${fromName ? ' ' + fromName : ''}，\n\n感谢您对我们的产品感兴趣。我们的AI Agent开发平台基础版免费，专业版999元/月。您可以访问我们的官网注册试用。\n\n如有其他问题，欢迎随时咨询。\n\n祝好，\n客服团队`;
      break;
      
    case 'order':
      // 调用工具查订单（复用你的工具框架）
      strategy = 'tool';
      replyContent = `您好${fromName ? ' ' + fromName : ''}，\n\n我帮您查询了订单状态。订单#12345预计3-5个工作日内发货，发货后您会收到通知。\n\n如有紧急需求，请联系客服热线。\n\n祝好，\n客服团队`;
      break;
      
    case 'complaint':
      // 需要人工处理，返回特殊标记
      strategy = 'human';
      replyContent = `您好${fromName ? ' ' + fromName : ''}，\n\n非常抱歉给您带来不便。您的投诉已转交人工客服处理，我们会在24小时内联系您。\n\n感谢您的反馈！`;
      break;
      
    default:
      // 用RAG知识库（复用你的RAG）
      strategy = 'rag';
      const ragResult = await askWithRAG(body);
      replyContent = ragResult.answer;
  }
  
  return {
    strategy,
    content: replyContent,
    subject: `Re: ${subject}`
  };
}

// ============ 工具3：保存回复到发件箱 ============
async function saveReply({ originalEmailId, toEmail, subject, body, generationType, confidence }) {
  const outbox = await prisma.outboxEmail.create({
    data: {
      accountId: 'test-account',
      originalEmailId,
      toEmail,
      subject,
      body,
      generationType,
      confidence,
      status: 'pending'
    }
  });
  return outbox;
}

// ============ 真实SMTP发送邮件 ============
async function sendRealEmail({ outboxId }) {
    try {
      // 从数据库获取待发送邮件
      const outbox = await prisma.outboxEmail.findUnique({
        where: { id: outboxId },
        include: { account: true }
      });
  
      if (!outbox) {
        throw new Error(`发件邮件 ${outboxId} 不存在`);
      }
  
      // 动态导入 nodemailer
      const nodemailer = require('nodemailer');
  
      // 创建SMTP发送器
      const transporter = nodemailer.createTransport({
        host: outbox.account.smtpHost,
        port: outbox.account.smtpPort,
        secure: outbox.account.smtpPort === 465, // 465用SSL，587用STARTTLS
        auth: {
          user: outbox.account.username,
          pass: outbox.account.password
        },
        tls: {
          rejectUnauthorized: false
        }
      });
  
      // 验证连接
      await transporter.verify();
      console.log('SMTP连接验证成功');
  
      // 发送邮件
      const mailOptions = {
        from: `"AI邮件助手" <${outbox.account.username}>`,
        to: outbox.toEmail,
        subject: outbox.subject,
        text: outbox.body,
        html: outbox.bodyHtml || outbox.body
      };
  
      const info = await transporter.sendMail(mailOptions);
      console.log('邮件发送成功:', info.messageId);
  
      // 更新发送状态
      await prisma.outboxEmail.update({
        where: { id: outboxId },
        data: {
          status: 'sent',
          sentAt: new Date()
        }
      });
  
      // 标记原邮件为已回复
      if (outbox.originalEmailId) {
        await prisma.inboxEmail.update({
          where: { id: outbox.originalEmailId },
          data: { isReplied: true }
        });
      }
  
      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
  
    } catch (error) {
      console.error('发送邮件失败:', error);
      
      // 记录失败状态
      await prisma.outboxEmail.update({
        where: { id: outboxId },
        data: {
          status: 'failed',
          errorMessage: error.message
        }
      });
      
      throw error;
    }
  }

// ============ 导出工具（兼容你的工具框架） ============
const emailTools = [
  {
    type: 'function',
    function: {
      name: 'classifyEmail',
      description: '根据邮件内容分类',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: '邮件主题' },
          body: { type: 'string', description: '邮件正文' },
          fromEmail: { type: 'string', description: '发件人邮箱' }
        },
        required: ['subject', 'body']
      }
    },
    execute: classifyEmail
  },
  {
    type: 'function',
    function: {
      name: 'generateReply',
      description: '根据邮件分类生成回复',
      parameters: {
        type: 'object',
        properties: {
          originalEmail: { type: 'object', description: '原始邮件对象' },
          category: { type: 'string', description: '邮件分类' }
        },
        required: ['originalEmail', 'category']
      }
    },
    execute: generateReply
  },
  {
    type: 'function',
    function: {
      name: 'saveReply',
      description: '保存生成的回复到发件箱',
      parameters: {
        type: 'object',
        properties: {
          originalEmailId: { type: 'string' },
          toEmail: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          generationType: { type: 'string' },
          confidence: { type: 'number' }
        },
        required: ['originalEmailId', 'toEmail', 'subject', 'body', 'generationType']
      }
    },
    execute: saveReply
  },
  {
    type: 'function',
    function: {
      name: 'fetchNewEmails',
      description: '获取新邮件',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: '邮箱账户ID' },
          limit: { type: 'number', description: '获取数量限制' }
        },
        required: ['accountId']
      }
    },
    execute: fetchNewEmails
  },
  // ============ 新增：真实接收邮件工具 ============
  {
    type: 'function',
    function: {
      name: 'fetchRealEmails',
      description: '从真实邮箱服务器获取新邮件',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: '邮箱账户ID' },
          limit: { type: 'number', description: '最大获取数量' }
        },
        required: ['accountId']
      }
    },
    execute: fetchNewEmails  // 复用你之前写的函数
  },

  // ============ 新增：真实发送邮件工具 ============
  {
    type: 'function',
    function: {
      name: 'sendRealEmail',
      description: '通过SMTP真实发送邮件',
      parameters: {
        type: 'object',
        properties: {
          outboxId: { type: 'string', description: '发件箱邮件ID' }
        },
        required: ['outboxId']
      }
    },
    execute: sendRealEmail
  }
];

module.exports = { emailTools };


