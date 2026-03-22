const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// 文件类型注册表
const fileTypes = {
  xlsx: {
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    generator: async (data, filePath) => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data.rows || []);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, filePath);
      return filePath;
    }
  },
  excel: {
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    generator: async (data, filePath) => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data.rows || []);
      XLSX.utils.book_append_sheet(wb, ws, data.sheetName || 'Sheet1');
      XLSX.writeFile(wb, filePath);
      return filePath;
    }
  },
  
  csv: {
    extension: '.csv',
    mimeType: 'text/csv',
    generator: async (data, filePath) => {
      const rows = data.rows || [];
      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      const csvContent = [
        headers.join(','),
        ...rows.map(row => headers.map(h => row[h]).join(','))
      ].join('\n');
      fs.writeFileSync(filePath, csvContent);
      return filePath;
    }
  },
  
  pdf: {
    extension: '.pdf',
    mimeType: 'application/pdf',
    generator: async (data, filePath) => {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      
      // 添加内容
      doc.fontSize(16).text(data.title || '文档', { align: 'center' });
      doc.moveDown();
      
      if (data.content) {
        doc.fontSize(12).text(data.content);
      }
      
      if (data.rows) {
        // 简单表格
        data.rows.forEach(row => {
          doc.text(Object.values(row).join(' | '));
        });
      }
      
      doc.end();
      return new Promise((resolve) => {
        stream.on('finish', () => resolve(filePath));
      });
    }
  },
  
  txt: {
    extension: '.txt',
    mimeType: 'text/plain',
    generator: async (data, filePath) => {
      let content = '';
      if (data.content) {
        content = data.content;
      } else if (data.rows) {
        content = data.rows.map(row => 
          Object.entries(row).map(([k, v]) => `${k}: ${v}`).join('\n')
        ).join('\n\n');
      }
      fs.writeFileSync(filePath, content);
      return filePath;
    }
  },
  
  json: {
    extension: '.json',
    mimeType: 'application/json',
    generator: async (data, filePath) => {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return filePath;
    }
  },
  
  md: {
    extension: '.md',
    mimeType: 'text/markdown',
    generator: async (data, filePath) => {
      let content = `# ${data.title || '文档'}\n\n`;
      
      if (data.content) {
        content += data.content + '\n\n';
      }
      
      if (data.rows) {
        content += '| ' + Object.keys(data.rows[0]).join(' | ') + ' |\n';
        content += '|' + Object.keys(data.rows[0]).map(() => '---').join('|') + '|\n';
        data.rows.forEach(row => {
          content += '| ' + Object.values(row).join(' | ') + ' |\n';
        });
      }
      
      fs.writeFileSync(filePath, content);
      return filePath;
    }
  },
  jpeg: {
    extension: '.jpg',
    mimeType: 'image/jpeg',
    generator: async (data, filePath) => {
      if (data.buffer) {
        fs.writeFileSync(filePath, data.buffer);
      } else if (data.url) {
        // 从URL下载图片
        const response = await fetch(data.url);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));
      } else {
        // 生成示例图片（纯色或简单图形）
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(800, 600);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = data.color || '#4a90e2';
        ctx.fillRect(0, 0, 800, 600);
        ctx.fillStyle = 'white';
        ctx.font = '30px Arial';
        ctx.fillText(data.title || 'Image', 100, 300);
        const buffer = canvas.toBuffer('image/jpeg');
        fs.writeFileSync(filePath, buffer);
      }
      return filePath;
    }
  },
  
  png: {
    extension: '.png',
    mimeType: 'image/png',
    generator: async (data, filePath) => {
      // 类似 JPEG 的逻辑，但用 PNG 编码
      // ...
    }
  },
  
  gif: {
    extension: '.gif',
    mimeType: 'image/gif',
    generator: async (data, filePath) => {
      // 处理 GIF
    }
  },
  word: {
    extension: '.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    generator: async (data, filePath) => {
      const { Document, Packer, Paragraph, TextRun } = require('docx');
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: data.title || '文档', bold: true, size: 32 }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun(data.content || '这是自动生成的文档内容。'),
              ],
            }),
            // 可以添加表格、图片等
          ],
        }],
      });
      
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, buffer);
      return filePath;
    }
  },
  
  ppt: {
    extension: '.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    generator: async (data, filePath) => {
      // 生成PPT的逻辑
    }
  },
  mp3: {
    extension: '.mp3',
    mimeType: 'audio/mpeg',
    generator: async (data, filePath) => {
      if (data.url) {
        // 从URL下载音频
        const response = await fetch(data.url);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));
      } else {
        // 生成示例音频（静音或简单波形）
        const { generateSilence } = require('audio-generator');
        const audioBuffer = generateSilence(5); // 5秒静音
        fs.writeFileSync(filePath, audioBuffer);
      }
      return filePath;
    }
  },
  
  mp4: {
    extension: '.mp4',
    mimeType: 'video/mp4',
    generator: async (data, filePath) => {
      // 生成示例视频（可以用FFmpeg生成简单视频）
      return new Promise((resolve, reject) => {
        ffmpeg()
          .input('color=black:s=640x480:d=5', { f: 'lavfi' })
          .output(filePath)
          .on('end', () => resolve(filePath))
          .on('error', reject)
          .run();
      });
    }
  }
};

module.exports = fileTypes;