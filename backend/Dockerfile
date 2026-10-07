FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# oracledb est optionnel : la reprise ASTECH se lance depuis un poste disposant d'Instant Client, pas depuis ce conteneur.
RUN npm ci --omit=dev --omit=optional
COPY . .
RUN mkdir -p /app/storage && chown -R node:node /app
USER node
EXPOSE 3320
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3320)+'/api/status').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
