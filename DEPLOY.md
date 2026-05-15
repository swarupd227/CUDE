# CUDE — Deployment Guide

> **Key principle:** Build the React frontend once (`node build.js`), then only the
> Node.js backend needs to run. It serves both the API **and** the UI on a single port (3001).
> Expose that one port — job done.

---

## Option 1 — Quick Demo Link (5 minutes, no account needed)

Use **ngrok** or **Cloudflare Tunnel** to get a public HTTPS URL for your local server.

### Step 1 — Build & start the app

```bat
REM Windows
cd cude-platform
node build.js
cd backend
set ANTHROPIC_API_KEY=sk-ant-...
node server.js
```

```bash
# Mac / Linux
cd cude-platform
node build.js
cd backend
ANTHROPIC_API_KEY=sk-ant-... node server.js
```

App is now running at `http://localhost:3001`

---

### Option 1a — ngrok (most popular)

**Install:** https://ngrok.com/download (free account, no credit card)

```bash
ngrok http 3001
```

You get a URL like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3001
```

Share that URL. Anyone worldwide can access it instantly. ✓

> **Free tier limits:** 1 tunnel, sessions expire when ngrok is closed.
> For persistent URLs, upgrade to ngrok Pro ($8/month).

---

### Option 1b — Cloudflare Tunnel (no account needed)

```bash
# Mac / Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
./cloudflared tunnel --url http://localhost:3001

# Windows (PowerShell)
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3001
```

You get a URL like:
```
https://random-words.trycloudflare.com
```

No account needed. URL is valid as long as the command runs. ✓

---

## Option 2 — Share on Corporate Network / VPN (Same Network)

If your colleagues are on the same network (office LAN or VPN):

**Find your machine's IP address:**

```bat
REM Windows
ipconfig
REM Look for IPv4 Address under your active adapter, e.g. 192.168.1.45
```

```bash
# Mac
ipconfig getifaddr en0
# Linux
hostname -I
```

**Start the backend bound to all interfaces:**

```bat
REM Windows
cd backend
set PORT=3001
node server.js
```

**Share:** `http://192.168.1.45:3001` (replace with your IP)

> **Note:** Windows Firewall may block inbound connections on port 3001.
> Allow it: Windows Defender Firewall → Allow an app → Add Node.js → Port 3001.

---

## Option 3 — Permanent Cloud Deployment

### Option 3a — Railway.app (Easiest, ~3 minutes)

Railway auto-detects Node.js and runs `build.js` + `backend/server.js`.

1. Create free account at https://railway.app
2. Connect your GitHub repo (push the `cude-platform` folder to a repo first)
3. Railway detects `railway.toml` automatically
4. In Railway dashboard → Variables → Add:
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   PORT = 3001
   ```
5. Deploy → you get a permanent URL like `https://cude-platform.up.railway.app`

**Cost:** Free tier includes 500 hours/month (enough for demos). $5/month for always-on.

---

### Option 3b — Render.com (Free tier available)

1. Create account at https://render.com
2. New → Web Service → Connect GitHub repo
3. Render detects `render.yaml` automatically
4. Set `ANTHROPIC_API_KEY` in Environment tab
5. Deploy → permanent URL

**Cost:** Free tier (spins down after 15 min inactivity). $7/month for always-on.

---

### Option 3c — Docker (Any Cloud Provider)

The `Dockerfile` builds a self-contained image. Run it anywhere Docker is available:
AWS ECS, Azure Container Apps, Google Cloud Run, DigitalOcean, etc.

**Build and run locally first to verify:**
```bash
docker-compose up --build
# Opens at http://localhost:3001
```

**Push to any container registry:**
```bash
# Azure Container Registry example
az acr login --name <your-registry>
docker build -t <your-registry>.azurecr.io/cude-platform:latest .
docker push <your-registry>.azurecr.io/cude-platform:latest
```

**Deploy to Azure Container Apps:**
```bash
az containerapp create \
  --name cude-platform \
  --resource-group <rg> \
  --image <your-registry>.azurecr.io/cude-platform:latest \
  --target-port 3001 \
  --ingress external \
  --env-vars ANTHROPIC_API_KEY=secretref:anthropic-key PORT=3001
```

---

### Option 3d — Azure App Service (Enterprise-grade)

For a proper enterprise deployment with AAD authentication:

```bash
# Create App Service
az webapp create \
  --name cude-platform-demo \
  --resource-group <rg> \
  --plan <plan> \
  --runtime "NODE:20-lts"

# Set environment variables
az webapp config appsettings set \
  --name cude-platform-demo \
  --resource-group <rg> \
  --settings \
    ANTHROPIC_API_KEY="sk-ant-..." \
    PORT=8080 \
    NODE_ENV=production

# Deploy from local folder
az webapp up --name cude-platform-demo --resource-group <rg>
```

Add Azure AD authentication in App Service → Authentication → Add identity provider.

---

## Quick Reference

| Scenario | Option | Time | Cost | Persistent? |
|---|---|---|---|---|
| Quick client demo | ngrok | 5 min | Free | No (session only) |
| No-install tunnel | Cloudflare Tunnel | 5 min | Free | No (session only) |
| Same office/VPN | Local IP | 2 min | Free | While laptop is on |
| Permanent demo URL | Railway.app | 10 min | Free / $5 | Yes |
| Permanent + always-on | Render.com | 10 min | $7/mo | Yes |
| Enterprise / IT | Azure App Service | 30 min | Azure pricing | Yes |
| Full containerised | Docker + any cloud | 20 min | Cloud pricing | Yes |

---

## Security Notes for Client Demos

- **Never commit** `ANTHROPIC_API_KEY` to Git — always use environment variables
- ngrok/Cloudflare URLs are **publicly accessible** — anyone with the link can see the app
- For internal demos, use **VPN + local IP** or **Azure with AAD auth**
- The seeded data is fictional — no real proprietary IP is present in the demo catalog
- The backend runs in-memory — data resets on restart (no persistent storage in this version)
