FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV ZENDO_SECURE_COOKIES=1
ENV ZENDO_DISABLE_TIMER=0
EXPOSE 38471
CMD ["npm", "start"]
