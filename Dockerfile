FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ src/
RUN npm run build && npm prune --production

FROM node:24-alpine
WORKDIR /app
RUN addgroup -S cal && adduser -S cal -G cal
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER cal
EXPOSE 3000
CMD ["node", "dist/main.js"]
