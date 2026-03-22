const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { PrismaClient } = require('@prisma/client');
const { OpenAI } = require('openai');
const pdf = require('pdf-parse');
const fs = require('fs');

const prisma = new PrismaClient();

// 初始化嵌入模型（复用你的阿里云配置）
const embeddings = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
});

// 1. 文档处理：从文件提取文本
async function extractTextFromFile(filePath, mimeType) {
  if (mimeType === 'application/pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } else {
    return fs.readFileSync(filePath, 'utf-8');
  }
} 

// 2. 文本分割
async function splitDocument(text, options = {}) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options.chunkSize || 500,
    chunkOverlap: options.chunkOverlap || 50,
    separators: ["。", "！", "？", "\n\n", "\n", " ", ""],
  });
  
  const chunks = await splitter.splitText(text);
  return chunks;
}

// 3. 生成嵌入向量
async function generateEmbedding(text) {
  const response = await embeddings.embeddings.create({
    model: 'text-embedding-v2',
    input: text,
  });
  return response.data[0].embedding;
}

// 4. 索引文档
async function indexDocument(title, filePath, mimeType) {
  try {
    const text = await extractTextFromFile(filePath, mimeType);
    const chunks = await splitDocument(text);
    
    const document = await prisma.document.create({
      data: {
        title,
        description: `从 ${filePath} 导入`,
      },
    });
    
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const embedding = await generateEmbedding(content);
      
      await prisma.$executeRaw`
        INSERT INTO "DocumentChunk" (id, "documentId", content, embedding, index, "createdAt")
        VALUES (gen_random_uuid(), ${document.id}, ${content}, ${JSON.stringify(embedding)}::vector, ${i}, NOW())
      `;
    }
    
    console.log(`✅ 文档索引完成: ${title}, 共 ${chunks.length} 个块`);
    return document;
  } catch (error) {
    console.error('索引文档失败:', error);
    throw error;
  }
}

// 5. 检索相关文档块
async function retrieveRelevantChunks(query, topK = 3) {
  const queryEmbedding = await generateEmbedding(query);
  
  const chunks = await prisma.$queryRaw`
    SELECT 
      dc.id,
      dc.content,
      dc.index,
      d.title as "documentTitle",
      1 - (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM "DocumentChunk" dc
    JOIN "Document" d ON dc."documentId" = d.id
    ORDER BY dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${topK}
  `;
  
  return chunks;
}

// 6. RAG问答
async function askWithRAG(question) {
  const relevantChunks = await retrieveRelevantChunks(question);
  
  if (relevantChunks.length === 0) {
    return {
      answer: "未在知识库中找到相关信息。",
      sources: []
    };
  }
  
  const context = relevantChunks
    .map(chunk => `[来自《${chunk.documentTitle}》] ${chunk.content}`)
    .join('\n\n');
  
  const prompt = `你是一个专业的问答助手。请基于以下提供的资料回答问题。
如果资料中没有相关信息，请直接说不知道，不要编造。

资料：
${context}

问题：${question}

回答：`;
  
  const openai = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  });
  
  const completion = await openai.chat.completions.create({
    model: 'qwen-plus',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });
  
  return {
    answer: completion.choices[0].message.content,
    sources: relevantChunks.map(c => ({
      title: c.documentTitle,
      content: c.content.substring(0, 100) + '...',
      similarity: c.similarity
    }))
  };
}

module.exports = {
  indexDocument,
  askWithRAG,
  retrieveRelevantChunks,
};