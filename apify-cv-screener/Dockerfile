FROM apify/actor-node:20

COPY package*.json ./
RUN npm install --omit=dev --include=prod

COPY . ./

CMD ["npm", "start"]