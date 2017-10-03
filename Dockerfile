FROM node:8-alpine
LABEL maintainer="Syed Hassaan Ahmed"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
CMD [ "npm", "start" ]