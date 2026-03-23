const logger = require('./logger');

/**
 * 带重试的异步函数执行器
 * @param {Function} fn - 要执行的异步函数
 * @param {Object} options - 配置选项
 * @param {number} options.maxRetries - 最大重试次数 (默认3)
 * @param {number} options.delay - 基础延迟毫秒 (默认1000)
 * @param {number} options.backoff - 退避倍数 (默认2)
 * @param {Function} options.onError - 错误回调
 * @returns {Promise<any>}
 */
async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    delay = 1000,
    backoff = 2,
    onError = null
  } = options;

  let lastError;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (onError) {
        onError(attempt, error);
      }
      
      if (attempt === maxRetries) {
        logger.error(`重试 ${maxRetries} 次后仍失败: ${error.message}`);
        throw error;
      }
      
      logger.warn(`执行失败 (${attempt}/${maxRetries}), ${currentDelay}ms后重试: ${error.message}`);
      await sleep(currentDelay);
      currentDelay *= backoff;
    }
  }
  
  throw lastError;
}

/**
 * 延迟函数
 * @param {number} ms - 毫秒
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 超时控制
 * @param {Promise} promise - 要执行的Promise
 * @param {number} timeoutMs - 超时毫秒
 * @param {string} errorMessage - 超时错误信息
 */
function withTimeout(promise, timeoutMs, errorMessage = '操作超时') {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

/**
 * 健康检查包装器
 * @param {Function} checkFn - 健康检查函数
 * @param {Object} options - 配置
 */
function withHealthCheck(checkFn, options = {}) {
  const { interval = 60000, name = 'unknown' } = options;
  
  let isHealthy = true;
  let lastCheck = null;
  let lastError = null;
  
  const check = async () => {
    try {
      await checkFn();
      isHealthy = true;
      lastError = null;
    } catch (error) {
      isHealthy = false;
      lastError = error.message;
      logger.error(`健康检查失败 [${name}]:`, error);
    }
    lastCheck = new Date();
  };
  
  // 立即执行一次
  check();
  
  // 定时检查
  const timer = setInterval(check, interval);
  
  return {
    getStatus: () => ({
      name,
      healthy: isHealthy,
      lastCheck,
      lastError,
      timestamp: new Date()
    }),
    stop: () => clearInterval(timer)
  };
}

module.exports = {
  retry,
  sleep,
  withTimeout,
  withHealthCheck
};