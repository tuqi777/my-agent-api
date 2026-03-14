FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm config set registry https://registry.npmmirror.com

RUN npm ci
RUN npx prisma generate

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]