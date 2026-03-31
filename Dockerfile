FROM node:18-alpine

WORKDIR /app

# Copy root package (if any) and server/client
COPY server ./server
COPY client ./client

# Install and build Client
WORKDIR /app/client
RUN npm install
RUN npm run build

# Install Server
WORKDIR /app/server
RUN npm install

# Expose Port
EXPOSE 3000

# Start Server
CMD ["node", "index.js"]
