FROM node:8-alpine
LABEL maintainer="Syed Hassaan Ahmed"

# Default values .. Override to enable load distribution
ENV TOTAL=1 INSTANCE=0 CONFIG=../config.json

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

CMD [ "npm", "start", "--", "-c", "$CONFIG", "-t", "$TOTAL", "-i", "$INSTANCE" ]