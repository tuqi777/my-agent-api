const express = require('express');
const OpenAI = require('openai');
const router = express.Router();

// 初始化 OpenAI 客户端（兼容阿里云 DashScope）
const openai = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,  // 从 .env 读取
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'  // 阿里云 OpenAI 兼容地址
});

// POST /api/chat - 流式对话
router.post('/', async (req, res) => {
  try {
    const { messages } = req.body;
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 调用大模型（流式模式）
    const stream = await openai.chat.completions.create({
      model: 'qwen-plus',  // 阿里云模型名，也可以用 deepseek-chat
      messages: messages,
      stream: true,
    });

    // 将流式响应转发给前端
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
    
  } catch (error) {
    console.error('Chat error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Failed to chat' })}\n\n`);
    res.end();
  }
});

module.exports = router;