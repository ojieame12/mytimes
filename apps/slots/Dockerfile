FROM node:24-alpine AS build

WORKDIR /app
ARG VITE_SLOTBOARD_API_URL
ENV VITE_SLOTBOARD_API_URL=$VITE_SLOTBOARD_API_URL

COPY package.json package-lock.json ./
COPY apps/slots/package.json apps/slots/package.json
COPY packages/slotboard-core/package.json packages/slotboard-core/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY apps/slots apps/slots
COPY packages/slotboard-core packages/slotboard-core
RUN npm run build --workspace @fresh-feel/slotboard-core && npm run build --workspace @fresh-feel/slots

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4174

COPY apps/slots/static-server.mjs static-server.mjs
COPY --from=build /app/apps/slots/dist dist

EXPOSE 4174
CMD ["node", "static-server.mjs"]
