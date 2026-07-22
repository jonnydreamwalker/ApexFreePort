# ApexFreePort

**Inventory control bridge for small e-commerce stores.**

Live product feed · simple admin · Square webhook stock adjustments · ON/OFF public feed switch.

Built for operators who need warehouse truth without a full ERP.

---

## License

[MIT](LICENSE) — free to use, modify, and self-host.

Hosted plans (managed node, SSL, support) available separately from the author.

---

## What it does

| Feature | Description |
|--------|-------------|
| **Admin deck** | Add/edit SKUs, price, qty, description, images, lane (direct / external) |
| **Public feed** | `GET /api/products` for your website catalog |
| **Kill switch** | One toggle — website feed ON or OFF without killing the node |
| **Square** | Webhook path to decrement stock on completed payments |
| **Health** | `GET /health` for uptime and integration status |

---

## Quick start (self-host)

### Requirements

- Node.js 18+
- Linux VPS or AWS free-tier EC2 (Amazon Linux / Ubuntu)

### Install

```bash
git clone https://github.com/jonnydreamwalker/ApexFreePort.git
cd ApexFreePort
npm install
```

### Configure (environment variables — never commit secrets)

```bash
export ADMIN_PASSWORD='your-strong-password'
export SQUARE_ACCESS_TOKEN='optional-square-token'   # optional
export PORT=3000
```

### Run

```bash
node server.js
# or
nohup node server.js > server.log 2>&1 &
```

- Admin: `http://YOUR_IP:3000/admin`
- Health: `http://YOUR_IP:3000/health`
- Products: `http://YOUR_IP:3000/api/products`

### HTTPS (recommended)

Put **nginx + Let’s Encrypt** in front (e.g. `api.yourdomain.com` → `127.0.0.1:3000`).
Point your storefront bridge at `https://api.yourdomain.com`.

---

## Website bridge

Drop a small script on your static/shop pages that calls:

```text
GET https://api.yourdomain.com/api/products?category=Hardscape
```

When the admin **public feed** is OFF, the API returns an error payload and empty items so the site can show “inventory offline.”

---

## Security notes

- Change `ADMIN_PASSWORD` before production.
- Do not commit `.env`, tokens, or `data/uploads` with private assets if the repo is public.
- Restrict SSH; prefer HTTPS only on 443 for the API.
- Square/Stripe tokens stay in environment variables on the server only.

---

## Roadmap

- Stripe & PayPal webhooks
- Stronger multi-tenant hosted tier
- Optional Postgres backend for larger catalogs

---

## Author

Jonathan Roberts · JDW Apex Herp · DeFuniak Springs, FL  
Demo context: [jdwapexherp.com](https://jdwapexherp.com)

Issues and PRs welcome for self-host improvements.
