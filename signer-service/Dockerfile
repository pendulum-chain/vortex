FROM node:20.11.0

EXPOSE 3000

ARG NODE_ENV
ENV NODE_ENV $NODE_ENV

RUN mkdir /app
WORKDIR /app
ADD package.json yarn.lock /app/
RUN yarn --pure-lockfile

# Copy .env file
COPY .env /app/.env

ADD . /app

CMD ["yarn", "start"]
