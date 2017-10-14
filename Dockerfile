FROM node:8-alpine
LABEL maintainer="Syed Hassaan Ahmed"

# Default values .. Override to enable load distribution
ENV TOTAL=1 INSTANCE=0

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .

CMD ls

#CMD [ "npm", "start", "--", "-t", "$TOTAL", "-i", "$INSTANCE" ]