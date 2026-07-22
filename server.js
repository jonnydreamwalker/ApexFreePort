/**
 * ApexFreePort — inventory bridge
 * MIT License © 2026 Jonathan Roberts / JDW Apex Herp
 */
const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || "change-me-apex";
const DATA = path.join(__dirname, "data", "inventory.json");
const UPLOAD_DIR = path.join(__dirname, "data", "uploads");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-apex-secret");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "apex-secret-change-me",
    resave: false,
    saveUninitialized: false,
  })
);
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const safe = (file.originalname || "img").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "-" + safe);
  },
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

function read() {
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}

function write(d) {
  d.updated = new Date().toISOString();
  fs.writeFileSync(DATA, JSON.stringify(d, null, 2));
}

function seedObject(row) {
  return {
    sku: row.sku,
    name: row.name || row.sku,
    category: row.category || "General",
    description: row.description || "",
    price: Number(row.price) || 0,
    qty: Number(row.qty) || 0,
    reserved: Number(row.reserved) || 0,
    lane: row.lane || "direct",
    status: row.status || "active",
    image: row.image || "",
    location: row.location || "",
  };
}

function auth(req, res, next) {
  if (req.session && req.session.ok) return next();
  if (req.path.indexOf("/api/") === 0) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.redirect("/login");
}

app.get("/health", function (req, res) {
  var d;
  try {
    d = read();
  } catch (e) {
    d = {};
  }
  res.json({
    ok: true,
    service: "ApexFreePort",
    publicFeed: d.publicFeed !== false,
    square: process.env.SQUARE_ACCESS_TOKEN ? "token-set" : "no-token",
    stripe: process.env.STRIPE_SECRET_KEY ? "token-set" : "no-token",
    paypal: process.env.PAYPAL_CLIENT_ID ? "client-set" : "no-client",
    etsy: process.env.ETSY_API_KEY ? "key-set" : "no-key",
  });
});

app.get("/api/products", function (req, res) {
  try {
    var d = read();
    if (d.publicFeed === false) {
      return res.status(503).json({
        error: "public_feed_off",
        message: "Website inventory feed is OFF. Flip the switch in admin when ready.",
        publicFeed: false,
        items: [],
      });
    }
    var items = d.items || [];
    var cat = req.query.category;
    if (cat) {
      items = items.filter(function (i) {
        return String(i.category || "").toLowerCase() === String(cat).toLowerCase();
      });
    }
    res.json({
      warehouse: d.warehouse,
      updated: d.updated,
      publicFeed: true,
      items: items.map(function (i) {
        var qty = i.qty || 0;
        var reserved = i.reserved || 0;
        return {
          sku: i.sku,
          name: i.name,
          category: i.category,
          description: i.description || "",
          price: i.price || 0,
          qty: qty,
          reserved: reserved,
          available: Math.max(0, qty - reserved),
          lane: i.lane,
          status: i.status,
          image: i.image || "",
          location: i.location || "",
        };
      }),
    });
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.get("/api/stock", function (req, res) {
  try {
    res.json(read());
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.post("/api/feed", auth, function (req, res) {
  try {
    var d = read();
    if (typeof req.body.publicFeed === "boolean") {
      d.publicFeed = req.body.publicFeed;
    }
    write(d);
    res.json({ ok: true, publicFeed: d.publicFeed !== false });
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.post("/api/inventory/adjust", auth, function (req, res) {
  try {
    var d = read();
    var sku = req.body.sku;
    var delta = Number(req.body.delta) || 0;
    var item = d.items.find(function (i) {
      return i.sku === sku;
    });
    if (!item) return res.status(404).json({ error: "not_found" });
    item.qty = Math.max(0, (item.qty || 0) + delta);
    write(d);
    res.json({ ok: true, item: item });
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.post("/api/inventory/upsert", auth, function (req, res) {
  try {
    var d = read();
    var row = req.body || {};
    if (!row.sku) return res.status(400).json({ error: "sku_required" });
    var i = d.items.findIndex(function (x) {
      return x.sku === row.sku;
    });
    if (i >= 0) {
      d.items[i] = Object.assign({}, d.items[i], row);
    } else {
      d.items.push(seedObject(row));
    }
    write(d);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.post("/api/inventory/upload", auth, upload.single("image"), function (req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    var rel = "/uploads/" + req.file.filename;
    var sku = req.body.sku;
    if (sku) {
      var d = read();
      var item = d.items.find(function (i) {
        return i.sku === sku;
      });
      if (item) {
        item.image = rel;
        write(d);
      }
    }
    res.json({ ok: true, image: rel });
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.post("/api/webhook/square", function (req, res) {
  res.status(200).json({ ok: true });
  try {
    var body = req.body || {};
    var typ = body.type || "";
    if (typ.indexOf("payment") === -1) return;
    var payment = (body.data && body.data.object && body.data.object.payment) || {};
    if (String(payment.status || "").toUpperCase() !== "COMPLETED") return;
    var note = payment.note || "";
    var m = note.match(/\b([A-Z0-9]+-[A-Z0-9-]+)\b/i);
    if (!m) return;
    var sku = m[1];
    var d = read();
    var item = d.items.find(function (i) {
      return i.sku === sku;
    });
    if (!item) return;
    item.qty = Math.max(0, (item.qty || 0) - 1);
    d.movements = d.movements || [];
    d.movements.push({
      at: new Date().toISOString(),
      sku: sku,
      delta: -1,
      reason: "square_payment",
    });
    write(d);
  } catch (e) {}
});

app.get("/login", function (req, res) {
  if (req.session && req.session.ok) return res.redirect("/admin");
  res.sendFile(path.join(__dirname, "admin", "login.html"));
});

app.post("/login", function (req, res) {
  if (req.body && req.body.password === PASS) {
    req.session.ok = true;
    return res.redirect("/admin");
  }
  res.redirect("/login?err=1");
});

app.post("/logout", function (req, res) {
  req.session.destroy(function () {
    res.redirect("/login");
  });
});

app.get("/admin", auth, function (req, res) {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

app.get("/api/inventory", auth, function (req, res) {
  try {
    res.json(read());
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.get("/", function (req, res) {
  res.redirect("/admin");
});

app.listen(PORT, function () {
  console.log("ApexFreePort on " + PORT);
  console.log("Square token: " + (process.env.SQUARE_ACCESS_TOKEN ? "set" : "no"));
});
