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