FROM node:alpine

CMD ["npm", "run", "dev"]
WORKDIR /app

COPY . /app/
