const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class RealEmailReceiver {
  constructor(config) {
    this.config = config;
    this.imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });
  }

  // 连接并获取新邮件
  async fetchNewEmails(accountId, limit = 10) {
    return new Promise((resolve, reject) => {
      const emails = [];
      
      this.imap.once('ready', () => {
        // 打开收件箱
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            reject(err);
            return;
          }

          // 搜索未读邮件（可以根据需求修改条件）
          this.imap.search(['UNSEEN'], (err, results) => {
            if (err || !results.length) {
              this.imap.end();
              resolve([]);
              return;
            }

            // 限制获取数量
            const fetchResults = results.slice(0, limit);
            
            // 获取邮件内容
            const fetch = this.imap.fetch(fetchResults, {
              bodies: '',
              struct: true
            });

            fetch.on('message', (msg, seqno) => {
              let emailData = '';

              msg.on('body', (stream) => {
                stream.on('data', (chunk) => {
                  emailData += chunk.toString('utf8');
                });
              });

              msg.once('end', async () => {
                try {
                  // 解析邮件
                  const parsed = await simpleParser(emailData);
                  
                  emails.push({
                    messageId: parsed.messageId || `msg-${Date.now()}-${seqno}`,
                    fromEmail: parsed.from?.value[0]?.address || '',
                    fromName: parsed.from?.value[0]?.name || '',
                    subject: parsed.subject || '',
                    body: parsed.text || '',
                    bodyHtml: parsed.html || '',
                    receivedAt: parsed.date || new Date(),
                    attachments: parsed.attachments || []
                  });
                } catch (parseErr) {
                  console.error('解析邮件失败:', parseErr);
                }
              });
            });

            fetch.once('end', () => {
              this.imap.end();
              resolve(emails);
            });

            fetch.once('error', (err) => {
              reject(err);
            });
          });
        });
      });

      this.imap.once('error', (err) => {
        reject(err);
      });

      this.imap.once('end', () => {
        console.log('IMAP连接关闭');
      });

      this.imap.connect();
    });
  }

  // 断开连接
  disconnect() {
    if (this.imap && this.imap.state === 'authenticated') {
      this.imap.end();
    }
  }
}

module.exports = RealEmailReceiver;