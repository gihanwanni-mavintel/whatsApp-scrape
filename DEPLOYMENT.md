# Deployment Guide: WhatsApp Scraper on Render

This guide will walk you through deploying the WhatsApp scraper to Render as a 24/7 service that automatically scrapes messages every hour.

---

## Prerequisites

- Render account (free tier works) - [Sign up here](https://render.com)
- GitHub account
- Your code pushed to a GitHub repository
- Neon PostgreSQL database (already configured)
- WhatsApp account for authentication

---

## Step 1: Prepare Your Repository

1. **Initialize Git (if not already done):**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - WhatsApp scraper"
   ```

2. **Create a GitHub repository:**
   - Go to [GitHub](https://github.com/new)
   - Create a new repository (e.g., `whatsapp-scraper`)
   - **Important:** Make it **private** (contains sensitive config)

3. **Push to GitHub:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/whatsapp-scraper.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Deploy to Render

### Option A: Using render.yaml (Recommended)

1. **Go to Render Dashboard:**
   - Visit [dashboard.render.com](https://dashboard.render.com)
   - Click **"New +"** → **"Blueprint"**

2. **Connect GitHub:**
   - Select your `whatsapp-scraper` repository
   - Render will detect the `render.yaml` file automatically

3. **Configure Environment Variables:**

   In the Render dashboard, add these environment variables:

   | Variable | Value | Description |
   |----------|-------|-------------|
   | `DATABASE_URL` | `postgresql://neondb_owner:npg_7ZWfNIS5XRlF@ep-shiny-credit-a1zls1xh-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` | Your Neon PostgreSQL connection string |
   | `MONITORED_GROUPS` | `94773783733-1602844054@g.us` | Group ID to monitor (Wealth Builders) |
   | `NODE_ENV` | `production` | Environment mode |
   | `CRON_SCHEDULE` | `0 * * * *` | Every hour (at minute 0) |
   | `TIMEZONE` | `Asia/Colombo` | Your timezone |
   | `MESSAGE_LIMIT` | `500` | Messages to fetch per scrape |
   | `SCRAPE_MEDIA` | `false` | Disable media download (saves space) |
   | `RETENTION_DAYS` | `30` | Keep messages for 30 days |
   | `LOG_LEVEL` | `info` | Logging verbosity |

4. **Add Persistent Disk (Important!):**
   - Service Type: **Web Service**
   - Disk Name: `whatsapp-session`
   - Mount Path: `/opt/render/project/src/.wwebjs_auth`
   - Size: **1 GB**

   **Why this is crucial:** This stores your WhatsApp session so you don't need to re-scan QR code after every deployment.

5. **Deploy:**
   - Click **"Create Blueprint"**
   - Render will start building and deploying your app

### Option B: Manual Setup

1. **Create Web Service:**
   - Click **"New +"** → **"Web Service"**
   - Connect your GitHub repository

2. **Configure Build Settings:**
   - **Name:** `whatsapp-scraper`
   - **Environment:** `Node`
   - **Build Command:** `pnpm install`
   - **Start Command:** `pnpm start`
   - **Plan:** Free (or Starter for better performance)

3. **Add Environment Variables** (same as above)

4. **Add Persistent Disk** (same as above)

5. **Deploy:**
   - Click **"Create Web Service"**

---

## Step 3: WhatsApp Authentication

After deployment, you need to authenticate WhatsApp:

1. **Wait for deployment to complete** (check logs in Render dashboard)

2. **Get your service URL:**
   - Example: `https://whatsapp-scraper-xyz.onrender.com`

3. **Open the QR code page:**
   ```
   https://whatsapp-scraper-xyz.onrender.com/api/qr
   ```

4. **Scan the QR code:**
   - Open WhatsApp on your phone
   - Go to **Settings → Linked Devices**
   - Tap **Link a Device**
   - Scan the QR code from your browser

5. **Verify authentication:**
   ```
   https://whatsapp-scraper-xyz.onrender.com/api/health
   ```

   Should show: `"status": "ready"`

---

## Step 4: Verify Scraping

1. **Check cron job status:**
   ```
   https://your-app.onrender.com/api/cron/status
   ```

2. **View scrape history:**
   ```
   https://your-app.onrender.com/api/groups/94773783733-1602844054@g.us/scrape-history
   ```

3. **Check logs in Render dashboard:**
   - Look for: `"Cron job triggered: Starting message scrape"`
   - Should occur every hour

4. **View messages via API:**
   ```
   https://your-app.onrender.com/api/groups/94773783733-1602844054@g.us/messages?limit=10
   ```

---

## Step 5: Configure Hourly Scraping

Your cron schedule is already set to run every hour (`0 * * * *`).

### How It Works:

- **Every hour at minute 0**: System scrapes new messages
- **Duplicate prevention**: Database ignores messages already scraped
- **Only new messages**: Efficiently fetches and stores only new content

### Modify Schedule (if needed):

Update the `CRON_SCHEDULE` environment variable in Render:

| Schedule | Cron Expression | Description |
|----------|----------------|-------------|
| Every hour | `0 * * * *` | At minute 0 of every hour |
| Every 2 hours | `0 */2 * * *` | At minute 0, every 2 hours |
| Every 30 min | `*/30 * * * *` | Every 30 minutes |
| Every 6 hours | `0 */6 * * *` | At midnight, 6am, noon, 6pm |
| Once daily | `0 0 * * *` | At midnight |

**After changing:** Redeploy the service in Render dashboard.

---

## Step 6: Export Messages from Render

### Method 1: API Export

```bash
curl -X POST https://your-app.onrender.com/api/export/94773783733-1602844054@g.us
```

Returns:
```json
{
  "success": true,
  "message": "Export completed successfully",
  "count": 3134,
  "file": "/opt/render/project/src/exports/messages_94773783733-1602844054_2026-01-19T08-00-00Z.json"
}
```

### Method 2: Download via Shell

In Render dashboard:
1. Go to **Shell** tab
2. Run:
   ```bash
   node export_to_json.js 94773783733-1602844054@g.us
   cat exports/messages_*.json
   ```

### Method 3: Query Database Directly

View messages via API endpoints without downloading:
```
https://your-app.onrender.com/api/groups/94773783733-1602844054@g.us/messages?limit=1000
```

---

## Important Notes

### 🔒 Security

- **Never commit `.env` file** - it contains sensitive credentials
- **Use Render's environment variables** for all secrets
- **Make GitHub repository private**
- **DATABASE_URL contains password** - keep secure

### 💾 Session Persistence

- **Persistent disk is crucial** - without it, you'll need to re-scan QR after every deploy
- **Disk path:** `/opt/render/project/src/.wwebjs_auth`
- **If session expires:** Visit `/api/qr` to re-authenticate

### ⚡ Performance

- **Free tier limitations:**
  - Spins down after 15 minutes of inactivity
  - Takes ~30 seconds to wake up
  - 750 hours/month free

- **For 24/7 uptime:**
  - Use **Starter plan** ($7/month)
  - Or use a service like [UptimeRobot](https://uptimerobot.com) to ping your service every 10 minutes

### 🐛 Troubleshooting

**Service won't start:**
- Check Render logs for errors
- Verify all environment variables are set
- Ensure `DATABASE_URL` is correct

**QR code not loading:**
- Wait 1-2 minutes after deployment
- Check service logs for "QR code received"
- Visit `/api/health` to check status

**Not scraping messages:**
- Check `/api/cron/status` endpoint
- View logs for "Cron job triggered"
- Verify WhatsApp is still authenticated

**"Promise was collected" error:**
- Reduce `MESSAGE_LIMIT` to 200-300
- This is a Puppeteer memory issue with large batches

---

## API Endpoints Reference

All endpoints available after deployment:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check and status |
| `/api/qr` | GET | WhatsApp QR code for auth |
| `/api/chats` | GET | List all WhatsApp chats |
| `/api/groups` | GET | List monitored groups |
| `/api/groups/:id/messages` | GET | Get messages (paginated) |
| `/api/groups/:id/stats` | GET | Group statistics |
| `/api/groups/:id/scrape-history` | GET | Scraping audit log |
| `/api/search?groupId=X&q=keyword` | GET | Search messages |
| `/api/scrape/:id` | POST | Manual scrape trigger |
| `/api/scrape-all` | POST | Scrape all groups |
| `/api/export/:id` | POST | Export to JSON |
| `/api/export-all` | POST | Export all messages |
| `/api/cron/status` | GET | Cron job status |

---

## Monitoring & Maintenance

### Daily Checks:

1. **Visit health endpoint:**
   ```
   https://your-app.onrender.com/api/health
   ```

2. **Check scrape history:**
   ```
   https://your-app.onrender.com/api/groups/94773783733-1602844054@g.us/scrape-history?limit=5
   ```

3. **View recent messages:**
   ```
   https://your-app.onrender.com/api/groups/94773783733-1602844054@g.us/messages?limit=10
   ```

### Weekly Maintenance:

- Review Render logs for errors
- Check database size in Neon dashboard
- Verify cron jobs are running on schedule

### Monthly Tasks:

- Update dependencies: `pnpm update`
- Review and adjust `RETENTION_DAYS` if needed
- Export historical data for backup

---

## Updating the Deployment

When you make code changes:

1. **Commit changes:**
   ```bash
   git add .
   git commit -m "Update feature"
   git push origin main
   ```

2. **Auto-deploy:**
   - Render automatically detects changes
   - Rebuilds and redeploys
   - Session persists via disk storage

3. **Manual deploy:**
   - Go to Render dashboard
   - Click **"Manual Deploy" → "Deploy latest commit"**

---

## Cost Estimate

### Free Tier:
- **Render Web Service:** Free (750 hours/month, spins down)
- **Render Disk (1GB):** Free
- **Neon PostgreSQL:** Free (0.5GB storage, 512MB RAM)
- **Total:** $0/month

### Paid Tier (Recommended for 24/7):
- **Render Starter:** $7/month (always on)
- **Render Disk (1GB):** Free
- **Neon Scale:** Free (sufficient for this use case)
- **Total:** $7/month

---

## Support

**Issues?**
- Check Render logs first
- Review this guide
- Test locally with `pnpm dev`
- Check database connectivity

**Need help?**
- Render Docs: https://render.com/docs
- Neon Docs: https://neon.tech/docs
- WhatsApp Web.js: https://wwebjs.dev

---

## Summary

Your WhatsApp scraper is now:
✅ Deployed to Render
✅ Running 24/7 (or on free tier schedule)
✅ Scraping messages every hour
✅ Storing in Neon PostgreSQL
✅ Accessible via REST API
✅ Exporting to JSON on demand

**Next Steps:**
1. Monitor the first few scrape cycles
2. Set up automated backups/exports
3. Consider upgrading to Starter plan for 24/7 uptime
