FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY index.js ./

ENV NODE_ENV=production
ENV PORT=3001
ENV VACITECH_DATA_FILE=/data/vacitech-data.json

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]
