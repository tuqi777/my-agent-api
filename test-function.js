const fileGenerator = require('./src/tools/fileGenerator.js');
const path = require('path');

async function testFunctionCalling() {
  console.log('🚀 开始测试 Function Calling...\n');

  // 测试1：生成视频数据
  console.log('📝 测试1: 生成视频数据');
  const videoParams = { bvid: 'BV1xx411c7mD', count: 5 };
  const videoData = await fileGenerator.generateVideoData(videoParams);
  console.log('✅ 生成的视频数据:', JSON.stringify(videoData, null, 2));
  console.log('-' + '='.repeat(50) + '\n');

  // 测试2：生成统计数据
  console.log('📝 测试2: 生成统计数据');
  const statsParams = { type: 'summary', data: videoData };
  const statsData = await fileGenerator.generateStats(statsParams);
  console.log('✅ 生成的统计数据:', JSON.stringify(statsData, null, 2));
  console.log('-' + '='.repeat(50) + '\n');

  // 测试3：让AI决定调用哪个工具
  console.log('📝 测试3: AI决策');
  const userRequest = '请帮我生成王师傅和小毛毛的10条视频数据，包括标题、播放量、点赞量';
  const decision = await fileGenerator.decideTool(userRequest);
  console.log('✅ AI决策结果:', JSON.stringify(decision, null, 2));
  console.log('-' + '='.repeat(50) + '\n');

  // 测试4：完整生成Excel文件
  console.log('📝 测试4: 生成Excel文件');
  const attachmentInfo = {
    type: 'xlsx',
    fileName: '测试_视频数据.xlsx',
    description: '请帮我生成王师傅和小毛毛的10条视频数据，包括标题、播放量、点赞量、收藏量'
  };
  
  const filePath = await fileGenerator.generateExcelWithAI(attachmentInfo, './temp/test.xlsx');
  console.log('✅ Excel文件已生成:', filePath);
  console.log('-' + '='.repeat(50) + '\n');

  console.log('🎉 所有测试完成！');
}

// 运行测试
testFunctionCalling().catch(console.error);