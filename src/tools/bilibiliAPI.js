const { exec } = require('child_process');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

class BilibiliAPI {
  constructor() {
    // 使用虚拟环境中的 Python
    this.pythonPath = path.join(__dirname, '../../venv/bin/python');
    this.scriptPath = path.join(__dirname, '../../scripts/bilibili_spider.py');
  }

  /**
   * 搜索用户
   * @param {string} keyword - 用户名关键词
   * @returns {Promise<Object|null>} 用户信息 { uid, name, videos }
   */
  async searchUser(keyword) {
    try {
      const { stdout, stderr } = await execPromise(
        `${this.pythonPath} ${this.scriptPath} --action search --keyword "${keyword}"`
      );
      
      if (stderr && !stderr.includes('WARNING')) {
        console.error('Python 错误:', stderr);
      }
      
      const result = JSON.parse(stdout);
      if (result.error) {
        console.error('搜索失败:', result.error);
        return null;
      }
      return result;
    } catch (error) {
      console.error('调用 Python 脚本失败:', error);
      return null;
    }
  }

  /**
   * 获取用户视频列表
   * @param {number} uid - 用户ID
   * @param {number} count - 获取数量（0表示全部）
   * @returns {Promise<Array>} 视频列表
   */
  async getVideos(uid, count = 0) {
    try {
      const { stdout, stderr } = await execPromise(
        `${this.pythonPath} ${this.scriptPath} --action videos --uid ${uid} --count ${count}`
      );
      
      if (stderr && !stderr.includes('WARNING')) {
        console.error('Python 错误:', stderr);
      }
      
      const videos = JSON.parse(stdout);
      return videos;
    } catch (error) {
      console.error('获取视频失败:', error);
      return [];
    }
  }

  /**
   * 获取用户所有视频（别名）
   */
  async getAllVideos(uid) {
    return this.getVideos(uid);
  }
}

module.exports = new BilibiliAPI();