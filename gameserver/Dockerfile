# Explicit, not a buildpack: `fly launch` would autodetect Node and guess,
# and a guess that changes between deploys is a deploy that breaks for a
# reason nobody wrote down.
FROM node:22-slim

WORKDIR /app

# Dependencies first so a code change does not reinstall them.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
