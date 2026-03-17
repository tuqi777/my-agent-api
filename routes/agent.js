const express = require('express');
const OpenAI = require('openai');
const { tools } = require('../utils/tools');

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
});

// 工具执行函数
async function executeToolCall(toolCall) {
  const { name, arguments: args } = toolCall.function;
  const tool = tools.find(t => t.function.name === name);
  
  if (!tool) {
    throw new Error(`未知工具: ${name}`);
  }
  
  // 解析参数
  const parsedArgs = JSON.parse(args);
  console.log(`🔧 执行工具: ${name}`, parsedArgs);
  
  // 执行工具
  const result = await tool.execute(parsedArgs);
  console.log(`✅ 工具结果:`, result);
  
  return result;
}

// POST /api/agent/chat - 带工具调用的对话
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 准备发送给模型的消息
    let currentMessages = [...messages];
    let shouldContinue = true;
    let maxIterations = 5; // 防止无限循环
    let iteration = 0;

    while (shouldContinue && iteration < maxIterations) {
      iteration++;
      
      // 调用模型（非流式，为了获取工具调用）
      const response = await openai.chat.completions.create({
        model: 'qwen-plus',
        messages: currentMessages,
        tools: tools,
        tool_choice: 'auto'
      });

      const choice = response.choices[0];
      const message = choice.message;

      // 把模型的回复添加到消息历史
      currentMessages.push(message);

      // 如果模型没有要求调用工具，就结束
      if (!message.tool_calls || message.tool_calls.length === 0) {
        // 发送最终回答（流式）
        const finalContent = message.content || '';
        for (const char of finalContent) {
          res.write(`data: ${JSON.stringify({ content: char })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 10)); // 模拟打字效果
        }
        res.write('data: [DONE]\n\n');
        shouldContinue = false;
        break;
      }

      // 处理工具调用
      for (const toolCall of message.tool_calls) {
        const result = await executeToolCall(toolCall);
        
        // 把工具结果作为新消息加入
        currentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        });
      }
    }

    res.end();
    
  } catch (error) {
    console.error('Agent error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Agent调用失败' })}\n\n`);
    res.end();
  }
});

module.exports = router;