# ============================================================================
# Dockerfile — Gyro Store v2 (para cuando Render construye en modo Docker)
# ============================================================================
# El stack es Node NATIVO: el backend se ejecuta con `tsx` (TypeScript directo,
# sin compilar), así que las devDependencies (tsx, typescript, vite, remix) se
# necesitan TAMBIÉN en runtime — por eso NO se hace prune de dependencias.
#
# Espeja el build de render.yaml: install (con --include=dev) + build del
# frontend (Remix/Vite) + `npm start`.
#
# Contexto de build = carpeta App/ (Root Directory del servicio = App). El
# node_modules del host queda fuera por .dockerignore: traería binarios de
# Windows y rompería `sharp` en Linux.
# ============================================================================
FROM node:20-bookworm-slim

# Render inyecta las variables de entorno; NODE_ENV=production replica render.yaml.
# Aun así se instala con --include=dev porque el runtime usa tsx.
ENV NODE_ENV=production

WORKDIR /app

# Copiar el código de App/ (sin node_modules ni tmp; ver .dockerignore).
COPY . .

# Backend + frontend (con dev) y compilación del frontend para servirlo desde Express.
RUN npm install --include=dev --legacy-peer-deps \
 && npm --prefix frontend install --include=dev --legacy-peer-deps \
 && npm --prefix frontend run build

# El server escucha en process.env.PORT (config.port); Render lo inyecta y detecta.
CMD ["npm", "start"]
