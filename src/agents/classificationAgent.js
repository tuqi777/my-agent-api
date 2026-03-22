const logger = require('../tools/logger');

class ClassificationAgent {
  classifyEmail(email) {
    console.log('当前处理的邮件为：',email);
    
    const { subject, body, fromEmail, fromName } = email;
    const text = `${subject} ${body} ${fromEmail} ${fromName || ''}`.toLowerCase();
    let returnData = {}
    // 系统通知
    if (fromEmail.includes('12306') || fromEmail.includes('noreply') || 
        text.includes('退票') || text.includes('系统通知')) {
        returnData = {
        category: 'system_notice',
        confidence: 0.9,
        priority: 1,
        action: 'archive'
      };
    }
    
    // 安全提醒
    else if (fromEmail.includes('github') || fromEmail.includes('security') ||
        text.includes('verify') || text.includes('sign in')) {
      returnData = {
        category: 'security_alert',
        confidence: 0.85,
        priority: 5,
        action: 'notify_user'
      };
    }
    
    // 产品咨询
    else if (text.includes('价格') || text.includes('多少钱') || 
        text.includes('试用') || text.includes('怎么用')) {
          returnData = {
        category: 'inquiry',
        confidence: 0.8,
        priority: 2,
        action: 'auto_reply'
      };
    }
    
    // 投诉
    else if (text.includes('投诉') || text.includes('退款') || 
        text.includes('差评') || text.includes('质量问题')) {
          returnData = {
        category: 'complaint',
        confidence: 0.8,
        priority: 4,
        action: 'human_review'
      };
    } else {
      returnData = {
        category: 'uncategorized',
        confidence: 0.5,
        priority: 1,
        action: 'review_needed'
      };
    }
    console.log('分类之后的类型为：',returnData);
    
    return returnData
  }
}

module.exports = new ClassificationAgent();