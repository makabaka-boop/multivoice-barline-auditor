# 纯前端开发镜像：内置测试与构建能力，运行时无需后端、不联网。
FROM node:20-alpine

WORKDIR /app

# 先装依赖，利用层缓存
COPY package.json package-lock.json* ./
RUN npm install

# 源码由 compose 以卷挂载提供；镜像内保留一份便于直接运行
COPY . .

EXPOSE 5173

# 默认启动 Vite dev server（compose 中显式覆盖 host）
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
