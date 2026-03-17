require('dotenv').config();
console.log('DATABASE_URL:', process.env.DATABASE_URL);
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const emailRouter = require('./routes/email');
const cron = require('node-cron');

// 中间件
app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 用户路由
const userRouter = require('./routes/users');
const chatRouter = require('./routes/chat');
const ragRouter = require('./routes/rag');
const agentRouter = require('./routes/agent');
app.use('/api/users', userRouter);
app.use('/api/chat', chatRouter);
app.use('/api/rag', ragRouter);
app.use('/api/agent', agentRouter);
app.use('/api/email', emailRouter);

// 定时任务：每分钟检查并处理新邮件
cron.schedule('*/1 * * * *', async () => {
  console.log('⏰ 自动检查新邮件...', new Date().toISOString());
  
  try {
    // ===== 第1步：检查新邮件 =====
    console.log('📬 步骤1: 检查新邮件...');
    const checkResponse = await fetch('http://localhost:3000/api/email/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'test-account', limit: 10 })
    });
    
    if (!checkResponse.ok) {
      throw new Error(`检查邮件失败: ${checkResponse.status}`);
    }
    
    const checkResult = await checkResponse.json();
    console.log(`📬 检查结果: 发现 ${checkResult.new || 0} 封新邮件`);
    
    // 如果有新邮件，获取它们的具体信息
    if (checkResult.new > 0 && checkResult.emails && checkResult.emails.length > 0) {
      
      // ===== 第2步：处理每一封新邮件（分类+生成回复）=====
      console.log(`🔄 步骤2: 开始处理 ${checkResult.emails.length} 封新邮件...`);
      
      for (const email of checkResult.emails) {
        try {
          console.log(`  - 处理邮件: ${email.subject} (${email.id})`);
          await fetch(`http://localhost:3000/api/email/process/${email.id}`, {
            method: 'POST'
          });
          // 稍微延迟一下，避免请求太快
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (processErr) {
          console.error(`  ❌ 处理邮件 ${email.id} 失败:`, processErr.message);
        }
      }
      
      // ===== 第3步：发送所有待处理的回复 =====
      console.log('📤 步骤3: 发送待处理回复...');
      const sendResponse = await fetch('http://localhost:3000/api/email/send-pending', {
        method: 'POST'
      });
      
      if (sendResponse.ok) {
        const sendResult = await sendResponse.json();
        console.log(`📤 发送完成: ${sendResult.sent || 0} 封邮件已发送`);
      } else {
        console.error('❌ 发送失败:', sendResponse.status);
      }
    } else {
      console.log('📭 没有新邮件需要处理');
    }
    
  } catch (error) {
    console.error('❌ 自动处理流程失败:', error.message);
  }
});

// 启动时立即执行一次
setTimeout(async () => {
  console.log('🚀 启动时执行首次邮件检查...');
  try {
    // 👇 加上 accountId
    await fetch('http://localhost:3000/api/email/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'test-account', limit: 5 })
    });
  } catch (error) {
    console.error('首次检查失败:', error.message);
  }
}, 5000);





// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});