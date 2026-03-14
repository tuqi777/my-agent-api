# 查看容器状态
docker compose ps

# 查看日志
docker compose logs -f app

# 停止容器
docker compose down

# 重启容器（代码修改后需要重新构建）
docker compose up -d --build

# 进入容器内部调试
docker exec -it my-agent-api-app-1 sh

# 查看数据库数据
docker exec -it my-agent-api-postgres-1 psql -U myuser -d agent_dev -c "SELECT * FROM \"User\";"

# my-agent-api 🤖

第一周 AI Agent 学习成果：一个支持用户管理和 AI 对话的后端 API。

## 技术栈
- Node.js + Express
- PostgreSQL + Prisma
- Docker
- 阿里云百炼大模型 API

## 快速开始
```bash
docker compose up -d
curl http://localhost:3000/api/users