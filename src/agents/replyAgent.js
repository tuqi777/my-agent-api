const { OpenAI } = require('openai');
const config = require('../config');
const logger = require('../tools/logger');

class ReplyAgent {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.ai.apiKey,
      baseURL: config.ai.baseURL
    });
  }

  async generateReply(email, classification) {
    const { subject, body, fromName, fromEmail } = email;
    console.log(classification.category,'识别的分类类型为');
    
    // 根据分类选择回复策略
    switch(classification.category) {
      case 'inquiry':
        // 咨询类：用模板回复
        return {
          strategy: 'template',
          content: `您好${fromName ? ' ' + fromName : ''}，
  
          感谢您对我们的产品感兴趣。我们的AI Agent开发平台基础版免费，专业版999元/月。您可以访问我们的官网注册试用。
          
          如有其他问题，欢迎随时咨询。
          
          祝好，
          客服团队`,
          subject: `Re: ${subject}`
        };
  
      case 'complaint':
        // 投诉类：用 AI 生成个性化回复
        return await this.generateWithAI(email);
  
      case 'security_alert':
        // 安全提醒：转人工
        return {
          strategy: 'human_review',
          content: 'NEEDS_HUMAN_REVIEW',
          subject: `Re: ${subject}`
        };
  
      case 'system_notice':
        // 系统通知：不回复
        return {
          strategy: 'archive',
          content: 'SYSTEM_NOTICE_NO_REPLY',
          subject: `Re: ${subject}`,
        };
  
      default:
        // 默认用 AI 生成
        const result = await this.generateWithAI(email);
        console.log('generateReply 返回的对象:', {
          hasAttachment: !!result.attachment,
          attachmentType: result.attachment?.type,
          fileName: result.attachment?.fileName
        });
        return result;
    }
  }
  formatReply(text) {
    if (!text) return '';
    
    // 确保段落之间有空白行
    let formatted = text
      .replace(/\. /g, '.\n\n')  // 句号后加两个换行
      .replace(/：/g, '：\n')      // 冒号后换行
      .replace(/([•\-●])\s/g, '\n$1 ') // 列表项前换行
      .replace(/\n{3,}/g, '\n\n') // 避免过多空行
      .trim();
    
    return formatted;
  }
  async generateWithAI(email) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: config.ai.model,
        messages: [
          { 
            role: 'system', 
            content: `你是一个专业的客服助手。请根据用户请求：
            1. 判断用户是否需要生成文件
            2. 识别文件类型（图片、文档、表格、音频、视频等）
            3. 用以下格式标记：
              【附件】文件类型: jpg/png/gif/docx/pptx/pdf/mp3/mp4/...
              【文件名】xxx.xxx
              【标题】文件标题
              【内容描述】对文件内容的详细描述，包括尺寸、时长、主题等
            4. 如果是图片，需要描述图片内容、风格、尺寸
            5. 如果是音频/视频，需要描述时长、格式、内容
            6. 如果是文档，需要描述内容结构、页数等` 
          },
          { 
            role: 'user', 
            content: `邮件主题：${email.subject}\n邮件内容：${email.body}` 
          }
        ],
        temperature: 0.7
      });
      
      let content = completion.choices[0].message.content;
      console.log(content,'识别的content为');
      
      // 解析附件信息
      let attachmentInfo = null;
  
      // 检测是否包含附件标记
      if (content.includes('附件')) {
        console.log('✅ 检测到【附件】标记');
        
        // 提取文件名
        const fileNameMatch = content.match(/【文件名】\s*([^\n]+)/);
        const fileName = fileNameMatch ? fileNameMatch[1].trim() : `附件_${Date.now()}.xlsx`;
        
        // 提取标题
        const titleMatch = content.match(/【标题】\s*([^\n]+)/);
        const title = titleMatch ? titleMatch[1].trim() : '文档';
        
        // 提取文件类型
        const typeMatch = content.match(/文件类型[:：]\s*([^\s\n]+)/);
        const fileType = typeMatch ? typeMatch[1].trim().toLowerCase() : 'xlsx';
        
        // 提取内容描述
        const descMatch = content.match(/【内容描述】\s*([^【]+)/);
        const description = descMatch ? descMatch[1].trim() : '';
        
        attachmentInfo = {
          type: fileType,
          fileName: fileName,
          title: title,
          description: description,
          fullContent: content // 保存完整内容以便后续处理
        };
        
        console.log('解析后的附件信息:', {
          type: fileType,
          fileName: fileName,
          title: title.substring(0, 30) + '...'
        });
        
        // 清理标记，只保留正文内容
        content = content
          .replace(/【附件】.*?(?=【|$)/gs, '')
          .replace(/【文件名】.*?(?=【|$)/gs, '')
          .replace(/【标题】.*?(?=【|$)/gs, '')
          .replace(/【内容描述】.*?(?=【|$)/gs, '')
          .trim();
      // 如果清理后为空，添加默认回复
      if (!content) {
        content = `您好，

      感谢您的邮件。我们已经收到您的请求，并为您整理了相关数据，详见附件。

      如有其他问题，欢迎随时联系。

      祝好，
      AI邮件助手`;
      }
      } else {
        console.log('❌ 未检测到附件标记');
      }
      
      return {
        strategy: 'ai_generated',
        content: this.formatReply(content),
        subject: `Re: ${email.subject}`,
        attachment: attachmentInfo
      };
    } catch (error) {
      logger.error('AI生成回复失败:', error);
      return this.generateReply(email, { category: 'inquiry', action: 'auto_reply' });
    }
  }
}

module.exports = new ReplyAgent();