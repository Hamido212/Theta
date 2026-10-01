# Theta for web hosts and servers. Data (database, images, backups) lives in /data.
#   docker build -t theta .
#   docker run -p 3000:3000 -v theta-daten:/data theta
FROM oven/bun:1.3 AS app
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY tsconfig.json ./
COPY media ./media
COPY src ./src

ENV NODE_ENV=production \
    THETA_HOST=0.0.0.0 \
    THETA_DB=/data/theta.db
RUN mkdir /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 3000
CMD ["bun", "src/server.ts"]
