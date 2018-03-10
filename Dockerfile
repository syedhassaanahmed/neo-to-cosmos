FROM node:9-alpine
LABEL maintainer="Syed Hassaan Ahmed"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

ENTRYPOINT ["/usr/local/bin/npm", "start", "--"]