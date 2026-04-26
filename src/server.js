const express      = require("express");
const cookieParser = require("cookie-parser");
const path         = require("path");
const https        = require("https");
const http         = require("http");

const app      = express();
const PORT     = process.env.PORT || 3001;
const API_BASE = process.env.API_BASE_URL || "https://insighta-backend-production.up.railway.app";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.locals.csrfToken = req.cookies.csrf_token || "";
  next();
});

function apiRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url     = new URL(API_BASE + urlPath);
    const isHttps = url.protocol === "https:";
    const lib     = isHttps ? https : http;
    const bodyStr = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        "X-API-Version": "1",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(bodyStr && { "Content-Length": Buffer.byteLength(bodyStr) }),
      },
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function requireAuth(req, res, next) {
  const token = req.cookies.access_token;

  if (token) {
    try {
      const result = await apiRequest("GET", "/auth/me", null, token);
      if (result.status === 200) {
        req.user = result.data.data;
        return next();
      }
    } catch {}
  }

  const refreshToken = req.cookies.refresh_token;
  if (refreshToken) {
    try {
      const refreshRes = await apiRequest("POST", "/auth/refresh", { refresh_token: refreshToken }, null);
      if (refreshRes.status === 200) {
        const { access_token, refresh_token: new_refresh } = refreshRes.data;
        const isProd = process.env.NODE_ENV === "production";
        res.cookie("access_token",  access_token,  { httpOnly: true, secure: isProd, sameSite: "lax", maxAge: 3 * 60 * 1000 });
        res.cookie("refresh_token", new_refresh,   { httpOnly: true, secure: isProd, sameSite: "lax", maxAge: 5 * 60 * 1000 });
        const meRes = await apiRequest("GET", "/auth/me", null, access_token);
        if (meRes.status === 200) {
          req.user = meRes.data.data;
          return next();
        }
      }
    } catch {}
  }

  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.clearCookie("csrf_token");
  return res.redirect("/login");
}

app.get("/", (req, res) => res.redirect("/dashboard"));

app.get("/login", (req, res) => {
  if (req.cookies.access_token) return res.redirect("/dashboard");
  res.render("login", { error: req.query.error || null });
});

app.get("/auth/github", (req, res) => {
  const portalCallback = `${req.protocol}://${req.get("host")}/auth/callback`;
  const params = new URLSearchParams({
    redirect_uri: portalCallback,
  });
  res.redirect(`${API_BASE}/auth/github?${params}`);
});

app.get("/auth/callback", async (req, res) => {
  const { access_token, refresh_token, error } = req.query;

  if (error || !access_token) {
    return res.redirect("/login?error=auth_failed");
  }

  const isProd = process.env.NODE_ENV === "production";

  res.cookie("access_token",  access_token,  { httpOnly: true,  secure: isProd, sameSite: "lax", maxAge: 3 * 60 * 1000 });
  res.cookie("refresh_token", refresh_token, { httpOnly: true,  secure: isProd, sameSite: "lax", maxAge: 5 * 60 * 1000 });

  return res.redirect("/dashboard");
});

app.get("/dashboard", requireAuth, async (req, res) => {
  const token = req.cookies.access_token;
  try {
    const result = await apiRequest("GET", "/api/profiles?limit=1", null, token);
    const total  = result.data.total || 0;
    res.render("dashboard", { user: req.user, total });
  } catch {
    res.render("dashboard", { user: req.user, total: 0 });
  }
});

app.get("/profiles", requireAuth, async (req, res) => {
  const token  = req.cookies.access_token;
  const params = new URLSearchParams();
  const { gender, age_group, country_id, page, limit, sort_by, order } = req.query;
  if (gender)     params.set("gender",     gender);
  if (age_group)  params.set("age_group",  age_group);
  if (country_id) params.set("country_id", country_id);
  if (sort_by)    params.set("sort_by",    sort_by);
  if (order)      params.set("order",      order);
  params.set("page",  page  || "1");
  params.set("limit", limit || "10");

  try {
    const result = await apiRequest("GET", `/api/profiles?${params}`, null, token);
    res.render("profiles", { user: req.user, ...result.data, query: req.query });
  } catch {
    res.render("profiles", { user: req.user, data: [], total: 0, page: 1, limit: 10, total_pages: 0, links: {}, query: req.query });
  }
});

app.get("/profiles/:id", requireAuth, async (req, res) => {
  const token = req.cookies.access_token;
  try {
    const result = await apiRequest("GET", `/api/profiles/${req.params.id}`, null, token);
    res.render("profile-detail", { user: req.user, profile: result.data.data });
  } catch {
    res.redirect("/profiles");
  }
});

app.get("/search", requireAuth, async (req, res) => {
  const token = req.cookies.access_token;
  const { q, page, limit } = req.query;
  let results = null;

  if (q) {
    const params = new URLSearchParams({ q });
    if (page)  params.set("page",  page);
    params.set("limit", limit || "10");
    try {
      const result = await apiRequest("GET", `/api/profiles/search?${params}`, null, token);
      results = result.data;
    } catch {}
  }

  res.render("search", { user: req.user, results, query: q || "" });
});

app.get("/account", requireAuth, (req, res) => {
  res.render("account", { user: req.user });
});

app.post("/logout", async (req, res) => {
  const token        = req.cookies.access_token;
  const refreshToken = req.cookies.refresh_token;
  try {
    await apiRequest("POST", "/auth/logout", { refresh_token: refreshToken }, token);
  } catch {}
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.clearCookie("csrf_token");
  res.redirect("/login");
});

app.listen(PORT, () => console.log(`Web portal running on port ${PORT}`));