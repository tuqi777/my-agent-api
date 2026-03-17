const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { indexDocument, askWithRAG } = require('../utils/rag');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// POST /api/rag/upload - 上传文档并索引
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }
    
    const file = req.file;
    const mimeType = file.mimetype;
    
    const document = await indexDocument(
      file.originalname,
      file.path,
      mimeType
    );
    
    fs.unlinkSync(file.path);
    
    res.json({
      success: true,
      documentId: document.id,
      title: document.title,
      message: '文档上传并索引成功',
    });
  } catch (error) {
    console.error('上传失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rag/ask - 提问
router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: '请输入问题' });
    }
    
    const result = await askWithRAG(question);
    res.json(result);
  } catch (error) {
    console.error('问答失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rag/documents - 列出所有已索引的文档
router.get('/documents', async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      include: {
        _count: {
          select: { chunks: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;