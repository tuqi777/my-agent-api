
const Imap = require('imap');
const { simpleParser } = require('mailparser');

class IMAPClient {
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

  async fetchUnread(limit = 10) {
    return new Promise((resolve, reject) => {
      const emails = [];
      let messageCount = 0;

      this.imap.once('ready', () => {
        console.log('IMAP连接成功，打开收件箱...');
        
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) return reject(err);

          this.imap.search(['UNSEEN'], (err, results) => {
            if (err) return reject(err);
            
            if (!results?.length) {
              console.log('没有新邮件');
              this.imap.end();
              return resolve([]);
            }

            console.log(`找到 ${results.length} 封未读邮件，获取前 ${limit} 封`);
            
            const fetchResults = results.slice(0, limit);
            const fetch = this.imap.fetch(fetchResults, { bodies: '' });

            fetch.on('message', (msg) => {
              messageCount++;
              let emailData = '';
              
              msg.on('body', (stream) => {
                stream.on('data', (chunk) => {
                  emailData += chunk.toString('utf8');
                });
              });

              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(emailData);
                  emails.push({
                    messageId: parsed.messageId || `msg-${Date.now()}`,
                    fromEmail: parsed.from?.value[0]?.address || '',
                    fromName: parsed.from?.value[0]?.name || '',
                    subject: parsed.subject || '',
                    body: parsed.text || '',
                    bodyHtml: parsed.html || '',
                    receivedAt: parsed.date || new Date()
                  });

                } catch (err) {
                  console.error('解析邮件失败:', err);
                }
              });
            });

            fetch.once('end', () => {
              setTimeout(()=>{
                resolve(emails);
                this.imap.end();
              })
            });

            fetch.once('error', reject);
          });
        });
      });

      this.imap.once('error', reject);
      this.imap.once('end', () => {
        console.log(`📊 最终统计: 共收到 ${messageCount} 封邮件流`);
        console.log(`✅ 成功解析并保存: ${emails.length} 封`);
      });

      this.imap.connect();
    });
  }

  disconnect() {
    this.imap.end();
  }
}

module.exports = IMAPClient;