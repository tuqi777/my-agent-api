FROM node:22-alpine

# 安装完整的编译工具链和Python
RUN apk add --no-cache python3 make g++ gcc

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm config set registry https://registry.npmmirror.com
RUN npm install --legacy-peer-deps
RUN npx prisma generate

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]