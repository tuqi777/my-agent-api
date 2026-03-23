// 当 B站 API 失败时的降级数据
const fallbackVideos = (count = 10) => {
    const videos = [];
    for (let i = 1; i <= count; i++) {
      videos.push({
        '序号': i,
        'BV号': `BV1xx411c7m${i}`,
        '视频标题': `【示例视频】第${i}集`,
        '发布日期': `2024-01-${String(i).padStart(2, '0')}`,
        '播放量': Math.floor(Math.random() * 100000) + 50000,
        '点赞量': Math.floor(Math.random() * 10000) + 5000,
        '收藏量': Math.floor(Math.random() * 5000) + 1000,
        '投币量': Math.floor(Math.random() * 3000) + 500,
        '弹幕数': Math.floor(Math.random() * 1500) + 100,
        '视频时长': `${Math.floor(Math.random() * 10) + 5}:${Math.floor(Math.random() * 60)}`,
        '分区': ['生活', '知识', '美食', 'Vlog'][Math.floor(Math.random() * 4)]
      });
    }
    return videos;
  };
  
  module.exports = { fallbackVideos };