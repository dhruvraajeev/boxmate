# Build the web app, then ship a slim image with only runtime deps (ws, tsx) + the built web app.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server server
COPY shared shared
COPY --from=build /app/dist/web dist/web
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "server/index.ts"]
