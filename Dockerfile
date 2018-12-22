FROM node:alpine

ARG SCRIPT=dev
ARG ENVIRONMENT=dev

CMD ["npm", "run", "$SCRIPT"]
WORKDIR /app

COPY . /app/
RUN if [[ "$ENVIRONMENT" = "prod" ]]; then; npm run build; fi
