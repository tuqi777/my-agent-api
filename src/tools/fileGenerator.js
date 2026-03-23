const fileTypes = require('./fileTypes');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const ExcelJS = require('exceljs');  // 👈 添加这行
const config = require('../config');  // 👈 确保有这行
const { OpenAI } = require('openai');
const bilibiliAPI = require('./bilibiliAPI');

class FileGenerator {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
    this.ensureTempDir();

    // 初始化 OpenAI（用于 AI 决策）
    this.openai = new OpenAI({
      apiKey: config.ai.apiKey,
      baseURL: config.ai.baseURL
    });
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  // 解析AI的附件请求
  parseAttachmentRequest(content) {
    const patterns = {
      excel: /生成excel|生成xlsx|表格|清单|列表/i,
      csv: /生成csv|逗号分隔/i,
      pdf: /生成pdf|文档|报告/i,
      txt: /生成txt|文本文件/i,
      json: /生成json|数据格式/i,
      md: /生成md|markdown/i
    };

    let detectedType = 'txt'; // 默认
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) {
        detectedType = type;
        break;
      }
    }

    // 从内容中提取文件名
    const fileNameMatch = content.match(/文件名[：:]\s*([^\s]+)/);
    const fileName = fileNameMatch ? fileNameMatch[1] : `文件_${Date.now()}`;

    // 提取标题
    const titleMatch = content.match(/标题[：:]\s*([^\n]+)/);
    const title = titleMatch ? titleMatch[1] : '文档';

    return {
      type: detectedType,
      fileName: fileName.endsWith(fileTypes[detectedType].extension) 
        ? fileName 
        : fileName + fileTypes[detectedType].extension,
      title,
      mimeType: fileTypes[detectedType].mimeType
    };
  }

  // 生成示例数据（可以根据AI描述动态生成）
  generateSampleData(request) {
    const { type, title, content } = request;
    
    const baseData = {
      title,
      content: content || '这是自动生成的内容。\n\n根据您的请求，我们为您整理了相关数据。'
    };

    switch(type) {
      case 'excel':
      case 'csv':
        return {
          ...baseData,
          sheetName: title,
          rows: [
            { '项目': '示例1', '数值': 100, '备注': '测试数据1' },
            { '项目': '示例2', '数值': 200, '备注': '测试数据2' },
            { '项目': '示例3', '数值': 300, '备注': '测试数据3' }
          ]
        };
      
      case 'pdf':
      case 'md':
        return {
          ...baseData,
          content: `${baseData.content}\n\n## 主要内容\n\n1. 第一项内容\n2. 第二项内容\n3. 第三项内容`
        };
      
      case 'json':
        return {
          ...baseData,
          items: [
            { id: 1, name: '项目1', value: 100 },
            { id: 2, name: '项目2', value: 200 },
            { id: 3, name: '项目3', value: 300 }
          ]
        };
      
      default:
        return baseData;
    }
  }

  // 生成文件
  async generateFile(attachmentInfo) {
    console.log('========== 开始生成文件 ==========');
    // console.log('attachmentInfo:', JSON.stringify(attachmentInfo, null, 2));
    
    try {
      this.ensureTempDir();
      
      const filePath = path.join(this.tempDir, attachmentInfo.fileName);
      // console.log('文件路径:', filePath);
      
      // 根据类型生成文件
      if (attachmentInfo.type === 'xlsx') {
        await this.generateExcelWithAI(attachmentInfo, filePath);
      } else {
        throw new Error(`不支持的文件类型: ${attachmentInfo.type}`);
      }
      
      // 检查文件
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log('✅ 文件生成成功，大小:', stats.size, '字节');
      }
      
      return {
        path: filePath,
        fileName: attachmentInfo.fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
    } catch (error) {
      console.error('❌ 文件生成失败:', error);
      throw error;
    }
  }

  // 清理临时文件
  cleanup(filePath) {
    try {
      // if (fs.existsSync(filePath)) {
      //   fs.unlinkSync(filePath);
      //   logger.info(`临时文件已删除: ${filePath}`);
      // }
    } catch (error) {
      logger.error('清理临时文件失败:', error);
    }
  }
    // ============ 工具定义：生成视频数据 ============
    async generateVideoData(params) {
      const { uid, userName, count = 0 } = params;
      console.log('🎬 生成视频数据:', { uid, userName, count });
    
      let targetUid = uid;
      let targetName = userName || '';
    
      // 如果没有 uid，但有用户名，先搜索获取 uid
      if (!targetUid && targetName) {
        console.log(`🔍 通过用户名 "${targetName}" 搜索用户...`);
        const user = await bilibiliAPI.searchUser(targetName);
        
        if (user && user.uid) {
          targetUid = user.uid;
          console.log(`✅ 找到用户: ${user.name} (UID: ${targetUid})`);
        } else {
          console.error(`❌ 未找到用户: ${targetName}`);
          throw new Error(`未找到用户: ${targetName}`);
        }
      }
    
      if (!targetUid) {
        throw new Error('未提供 uid 或用户名，无法获取B站数据');
      }
    
      try {
        console.log(`📡 正在从 B站 API 获取 UID ${targetUid} 的视频数据...`);
        let videos = await bilibiliAPI.getAllVideos(targetUid);
        
        if (!videos || videos.length === 0) {
          throw new Error(`获取 UID ${targetUid} 的视频数据为空，可能是API限流或用户无公开视频`);
        }
        
        console.log(`✅ 成功获取 ${videos.length} 条视频数据`);
        
        if (count > 0 && count < videos.length) {
          videos = videos.slice(0, count);
        }
        
        return videos.map((video, index) => ({
          '序号': index + 1,
          'BV号': video.bvid,
          '视频标题': video.title,
          '发布日期': video.created,
          '播放量': video.views,
          '点赞量': video.likes,
          '收藏量': video.favorites,
          '投币量': video.coins,
          '弹幕数': video.danmaku,
          '视频时长': video.duration,
          '视频链接': `https://www.bilibili.com/video/${video.bvid}`,
          '分区': video.category
        }));
        
      } catch (error) {
        console.error(`❌ 获取 UID ${targetUid} 数据失败:`, error.message);
        throw new Error(`获取B站数据失败: ${error.message}`);
      }
    }
  
    // ============ 工具定义：生成统计数据 ============
    async generateStats(params) {
      const { type, data } = params;
      console.log('📊 生成统计数据:', { type,data });
      // 如果 data 是字符串，根据字符串生成对应的数据
      if (typeof data === 'string') {
        if (data === 'video_list') {
          // 生成视频列表数据
          return await this.generateVideoData({ count: 1000 });
        }
      }
      switch(type) {
        case 'top10':
          return data.slice(0, 10).map(item => ({
            title: item.title,
            views: item.views,
            likes: item.likes
          }));
        case 'summary':
          let videoData;
          if (Array.isArray(data)) {
            videoData = data;
          } else {
            // 如果没有数据，生成示例数据
            videoData = await this.generateVideoData({ count: 10 });
          }
          
          const totalViews = videoData.reduce((sum, item) => sum + item.views, 0);
          const totalLikes = videoData.reduce((sum, item) => sum + item.likes, 0);
          return {
            totalVideos: videoData.length,
            totalViews,
            totalLikes,
            avgLikes: Math.round(totalLikes / videoData.length)
          };
        case 'video_summary':
            // 处理视频汇总数据
            const rows = [];
            const totalVideos = data.total_videos || 87;
            
            // 根据 AI 描述的字段生成示例数据
            for (let i = 1; i <= totalVideos; i++) {
              const row = {};
              data.fields.forEach(field => {
                switch(field) {
                  case '序号':
                    row[field] = i;
                    break;
                  case 'BV号':
                    row[field] = `BV1xx411c7m${i}`;
                    break;
                  case '视频标题':
                    row[field] = `【王师傅和小毛毛】第${i}集`;
                    break;
                  case '发布日期':
                    const date = new Date(data.latest_date || '2024-06-30');
                    date.setDate(date.getDate() - (totalVideos - i));
                    row[field] = date.toISOString().split('T')[0];
                    break;
                  case '播放量':
                    row[field] = Math.floor(Math.random() * 100000) + 50000;
                    break;
                  case '点赞量':
                    row[field] = Math.floor(Math.random() * 10000) + 5000;
                    break;
                  case '收藏量':
                    row[field] = Math.floor(Math.random() * 5000) + 1000;
                    break;
                  case '投币量':
                    row[field] = Math.floor(Math.random() * 3000) + 500;
                    break;
                  case '评论数':
                    row[field] = Math.floor(Math.random() * 2000) + 200;
                    break;
                  case '视频时长':
                    row[field] = `${Math.floor(Math.random() * 10) + 5}:${Math.floor(Math.random() * 60)}`;
                    break;
                  case '分区':
                    row[field] = ['生活', '知识', '美食', 'Vlog'][Math.floor(Math.random() * 4)];
                    break;
                  case '是否合集/连载标识':
                    row[field] = i % 3 === 0 ? '是' : '否';
                    break;
                  default:
                    row[field] = '-';
                }
              });
              rows.push(row);
            }
            
            // 添加数据来源说明
            console.log('数据来源:', data.data_source);
            console.log('备注:', data.notes);
            
            return rows;
        default:
          return [];
      }
    }
  
    // ============ Function Calling 主入口 ============
    async callFunction(functionName, parameters) {
      console.log('🔧 调用函数:', functionName, parameters);
  
      switch(functionName) {
        case 'generateVideoData':
          return await this.generateVideoData(parameters);
        case 'generateStats':
          return await this.generateStats(parameters);
        default:
          throw new Error(`未知函数: ${functionName}`);
      }
    }
  
    // ============ 让 AI 决定调用哪个工具 ============
    async decideTool(userRequest) {
      try {
        console.log('请求体为：',userRequest);
        
        const completion = await this.openai.chat.completions.create({
          model: config.ai.model,
          messages: [
            {
              role: 'system',
              content: `你是一个智能助手，需要根据用户请求决定调用哪个工具。
              可用工具：
              1. generateVideoData: 生成B站视频数据，参数 { uid, userName, bvid, count }
                - uid: B站用户ID（数字），可以从用户提供的链接中提取，如 space.bilibili.com/452606628 中的 452606628
                - userName: B站用户名（文字），如果用户只提供了昵称而不是链接，用这个参数
                - bvid: 单个视频的BV号（可选）
                - count: 生成数量（默认全部）

              2. generateStats: 生成统计数据，参数 { type, data }

              返回格式必须是 JSON：{ "function": "工具名", "parameters": {...} }

              注意：
              - 优先从用户提供的链接中提取 uid
              - 如果用户只提供了用户名，用 userName 参数
              - 如果使用generateVideoData工具，则用户名或uid必传其中一个
              - 不要写死 uid，动态从用户请求中获取`
            },
            {
              role: 'user',
              content: userRequest
            }
          ],
          temperature: 0.3,
          response_format: { type: "json_object" }
        });
        console.log('OpenAI返回的数据为：',completion.choices);
        
        const decision = JSON.parse(completion.choices[0].message.content);
        console.log('🤖 AI 决定调用:', decision);
        return decision;
      } catch (error) {
        console.error('AI 决策失败:', error);
        return null;
      }
    }
  
    // ============ 生成 Excel 文件（整合 Function Calling） ============
    async generateExcelWithAI(attachmentInfo, filePath) {
      // console.log('开始生成 Excel，附件信息:', attachmentInfo);
  
      // 1. 让 AI 决定需要什么数据
      const decision = await this.decideTool(attachmentInfo.fullContent);
      
      // 2. 执行工具获取数据
      let rows = [];
      if (decision) {
        rows = await this.callFunction(decision.function, decision.parameters);
      } else {
        // 降级方案：用模拟数据
        rows = await this.generateVideoData({ count: 10 });
      }
  
      // 3. 生成 Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('视频列表');
  
      if (rows.length > 0) {
        // 设置列（从第一行数据提取字段名）
        const headers = Object.keys(rows[0]);
        worksheet.columns = headers.map(key => ({
          header: key,
          key: key,
          width: 15
        }));
  
        // 添加数据
        rows.forEach(row => {
          worksheet.addRow(row);
        });
        // 设置链接列为可点击超链接
        const linkColumnIndex = headers.findIndex(h => h.indexOf('链接') >-1 );
        if (linkColumnIndex !== -1) {
          for (let i = 2; i <= worksheet.rowCount; i++) {
            const cell = worksheet.getCell(i, linkColumnIndex + 1);
            if (cell.value && typeof cell.value === 'string' && cell.value.startsWith('http')) {
              cell.value = { text: cell.value, hyperlink: cell.value };
              cell.style = { font: { color: { argb: 'FF0000FF' }, underline: true } };
            }
          }
        }
        // 添加表头样式
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
      }
  
      // 保存文件
      await workbook.xlsx.writeFile(filePath);
      console.log('✅ Excel 文件生成成功:', filePath);
      return filePath;
    }
  }

module.exports = new FileGenerator();