const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ============ 工具1：查询用户信息 ============
const getUserInfoSchema = z.object({
  name: z.string().describe("要查询的用户名")
});

async function getUserInfo({ name }) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        name: {
          contains: name,
          mode: 'insensitive'
        }
      }
    });
    
    if (!user) {
      return `未找到名为 ${name} 的用户`;
    }
    
    return `找到用户：${user.name}，邮箱：${user.email}，创建时间：${user.createdAt}`;
  } catch (error) {
    return `查询用户失败：${error.message}`;
  }
}

// ============ 工具2：创建新用户 ============
const createUserSchema = z.object({
  name: z.string().describe("用户名"),
  email: z.string().email().describe("用户邮箱")
});

async function createUser({ name, email }) {
  try {
    const user = await prisma.user.create({
      data: { name, email }
    });
    return `用户创建成功：${user.name} (${user.email})`;
  } catch (error) {
    if (error.code === 'P2002') {
      return `创建失败：邮箱 ${email} 已存在`;
    }
    return `创建用户失败：${error.message}`;
  }
}

// ============ 工具3：获取当前时间 ============
const getCurrentTimeSchema = z.object({});

async function getCurrentTime() {
  const now = new Date();
  return `当前时间是：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
}

// ============ 工具4：模拟查天气（可替换为真实API） ============
const getWeatherSchema = z.object({
  city: z.string().describe("城市名")
});

async function getWeather({ city }) {
  // 这里可以替换为真实的天气API调用
  const weathers = {
    '北京': '晴，25°C',
    '上海': '多云，28°C',
    '广州': '小雨，30°C',
    '深圳': '阴，29°C'
  };
  
  return `城市：${city}，天气：${weathers[city] || '暂无数据'}`;
}

// ============ 工具定义（用于 OpenAI 格式） ============
const tools = [
  {
    type: 'function',
    function: {
      name: 'getUserInfo',
      description: '根据用户名查询用户信息',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '要查询的用户名'
          }
        },
        required: ['name']
      }
    },
    execute: getUserInfo
  },
  {
    type: 'function',
    function: {
      name: 'createUser',
      description: '创建新用户',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '用户名'
          },
          email: {
            type: 'string',
            description: '用户邮箱'
          }
        },
        required: ['name', 'email']
      }
    },
    execute: createUser
  },
  {
    type: 'function',
    function: {
      name: 'getCurrentTime',
      description: '获取当前时间',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    execute: getCurrentTime
  },
  {
    type: 'function',
    function: {
      name: 'getWeather',
      description: '查询某个城市的天气',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名'
          }
        },
        required: ['city']
      }
    },
    execute: getWeather
  }
];

module.exports = { tools };