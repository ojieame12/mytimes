FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/slots-api/package.json apps/slots-api/package.json
COPY packages/slotboard-core/package.json packages/slotboard-core/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY apps/slots-api apps/slots-api
COPY packages/slotboard-core packages/slotboard-core
RUN npm run build --workspace @fresh-feel/slots-api
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/slots-api apps/slots-api
COPY --from=build /app/packages/slotboard-core packages/slotboard-core

EXPOSE 3014
CMD ["npm", "run", "start", "--workspace", "@fresh-feel/slots-api"]
