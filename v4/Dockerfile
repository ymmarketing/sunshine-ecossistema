FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY migrations ./migrations
COPY public ./public
COPY src ./src
ENV NODE_ENV=production
EXPOSE 4174
CMD ["npm","start"]
