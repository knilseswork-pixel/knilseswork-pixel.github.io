const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs/promises");
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { fetch: undiciFetch, ProxyAgent } = require("undici");

function telegramDisabled() {
  return process.env.TELEGRAM_DISABLED === "1" || process.env.TELEGRAM_DISABLED === "true";
}

const telegramProxyUrl = (process.env.TELEGRAM_PROXY || "").trim();
let telegramDispatcher = null;
if (telegramDisabled()) {
  console.log("Telegram: отключён (TELEGRAM_DISABLED), заявки только по почте");
} else if (telegramProxyUrl) {
  try {
    telegramDispatcher = new ProxyAgent(telegramProxyUrl);
    console.log("Telegram: используется прокси");
  } catch (e) {
    console.warn("Telegram: неверный TELEGRAM_PROXY:", e.message);
  }
}

function telegramFetchTimeoutMs() {
  const n = Number(process.env.TELEGRAM_FETCH_MS);
  if (Number.isFinite(n) && n > 0) return n;
  return telegramDispatcher ? 45000 : 20000;
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: "32kb" }));

function sanitize(str) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, 500);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

async function sendTelegram(text) {
  if (telegramDisabled()) {
    return { ok: false, skipped: true };
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("Telegram: пропуск — не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID");
    return { ok: false, skipped: true };
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const fetchOpts = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
    signal: AbortSignal.timeout(telegramFetchTimeoutMs()),
  };
  if (telegramDispatcher) {
    fetchOpts.dispatcher = telegramDispatcher;
  }
  const doFetch = telegramDispatcher ? undiciFetch : fetch;
  let res;
  try {
    res = await doFetch(url, fetchOpts);
  } catch (e) {
    const name = e && e.name;
    if (name === "AbortError" || name === "TimeoutError") {
      console.error(
        "Telegram: таймаут запроса к api.telegram.org (через прокси — проверьте TELEGRAM_PROXY и при необходимости увеличьте TELEGRAM_FETCH_MS)"
      );
      return { ok: false, error: "timeout" };
    }
    const msg = (e && e.message) || String(e);
    const cause = e && e.cause;
    console.error("Telegram: сеть/прокси:", msg, cause || "");
    return { ok: false, error: msg };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    console.error("Telegram error:", data);
    return { ok: false, error: data.description || res.statusText };
  }
  return { ok: true };
}

async function sendMail({ name, phone, email }) {
  const smtpOff = process.env.SMTP_DISABLED === "1" || process.env.SMTP_DISABLED === "true";
  if (smtpOff) {
    return { ok: false, skipped: true };
  }

  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "").trim();
  const to = (process.env.MAIL_TO || "").trim();
  const from = (process.env.MAIL_FROM || user || "").trim();

  if (!host || !user || !pass || !to) {
    console.warn("Почта: пропуск — не заданы SMTP_HOST, SMTP_USER, SMTP_PASS или MAIL_TO");
    return { ok: false, skipped: true };
  }

  const smtpMs = Number(process.env.SMTP_TIMEOUT_MS) || 12000;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === "true";

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: smtpMs,
    greetingTimeout: smtpMs,
    socketTimeout: smtpMs,
    ...(port === 587 && !secure ? { requireTLS: true } : {}),
  });

  const subject = `Новая заявка: ремонт кровли гаража — ${phone}`;
  const text = [
    `ФИО: ${name}`,
    `Телефон: ${phone}`,
    `Email: ${email}`,
    "",
    `Время: ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}`,
  ].join("\n");

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html: `<p><strong>ФИО:</strong> ${escapeHtml(name)}</p>
<p><strong>Телефон:</strong> ${escapeHtml(phone)}</p>
<p><strong>Email:</strong> ${escapeHtml(email)}</p>
<p><em>${escapeHtml(new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }))}</em></p>`,
  });

  return { ok: true };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.post("/api/order", async (req, res) => {
  try {
    const name = sanitize(req.body?.name);
    const phone = sanitize(req.body?.phone);
    const email = sanitize(req.body?.email).toLowerCase();

    if (!name || name.length < 2) {
      return res.status(400).json({ ok: false, error: "Укажите корректное ФИО." });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ ok: false, error: "Укажите корректный номер телефона." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "Укажите корректный email." });
    }

    const tgText = [
      "<b>Новая заявка с сайта</b> (ремонт кровли гаража)",
      "",
      `<b>ФИО:</b> ${escapeHtml(name)}`,
      `<b>Телефон:</b> ${escapeHtml(phone)}`,
      `<b>Email:</b> ${escapeHtml(email)}`,
    ].join("\n");

    const [mailResult, tgResult] = await Promise.allSettled([
      sendMail({ name, phone, email }),
      sendTelegram(tgText),
    ]);

    const mailOk = mailResult.status === "fulfilled" && mailResult.value?.ok;
    const tgOk = tgResult.status === "fulfilled" && tgResult.value?.ok;
    const mailSkipped = mailResult.status === "fulfilled" && mailResult.value?.skipped;
    const tgSkipped = tgResult.status === "fulfilled" && tgResult.value?.skipped;

    if (mailResult.status === "rejected") console.error("Mail:", mailResult.reason);
    if (tgResult.status === "rejected") console.error("Telegram:", tgResult.reason);

    const anySent = mailOk || tgOk;
    const bothSkipped = mailSkipped && tgSkipped;

    if (bothSkipped) {
      return res.status(503).json({
        ok: false,
        error:
          "Заявка не отправлена: на сервере не настроены почта и Telegram. Скопируйте .env.example в .env и заполните данные.",
      });
    }

    if (!anySent) {
      return res.status(502).json({
        ok: false,
        error: "Не удалось отправить заявку. Проверьте SMTP и токен Telegram в .env.",
      });
    }

    return res.json({
      ok: true,
      message: "Заявка принята. Мы свяжемся с вами в ближайшее время.",
      channels: {
        email: mailOk ? "sent" : mailSkipped ? "not_configured" : "error",
        telegram: tgOk ? "sent" : tgSkipped ? "not_configured" : "error",
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Внутренняя ошибка сервера." });
  }
});

const GALLERY_EXT = /\.(jpe?g|png|gif|webp)$/i;

app.get("/api/gallery-images", async (req, res) => {
  try {
    const dir = path.join(__dirname, "public", "images");
    const files = await fs.readdir(dir);
    const images = files
      .filter((f) => {
        if (f.startsWith(".")) return false;
        if (!GALLERY_EXT.test(f)) return false;
        const base = f.replace(/\.[^.]+$/, "");
        if (/^logo/i.test(base)) return false;
        return true;
      })
      .sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));
    res.json({ ok: true, images });
  } catch (e) {
    console.error("gallery-images:", e);
    res.status(500).json({ ok: false, images: [] });
  }
});

const REVIEWS_PATH = path.join(__dirname, "data", "reviews.json");
const MAX_REVIEWS = 200;

async function readReviews() {
  try {
    const raw = await fs.readFile(REVIEWS_PATH, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeReviews(list) {
  await fs.mkdir(path.dirname(REVIEWS_PATH), { recursive: true });
  await fs.writeFile(REVIEWS_PATH, JSON.stringify(list, null, 2), "utf8");
}

app.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await readReviews();
    reviews.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, reviews });
  } catch (e) {
    console.error("reviews get:", e);
    res.status(500).json({ ok: false, reviews: [] });
  }
});

app.post("/api/reviews", async (req, res) => {
  try {
    if (req.body && req.body.website) {
      return res.status(400).json({ ok: false, error: "Отклонено." });
    }
    const author = String(req.body?.author || "")
      .trim()
      .slice(0, 100);
    const text = String(req.body?.text || "")
      .trim()
      .slice(0, 1200);
    let rating = Number(req.body?.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) rating = 5;
    rating = Math.round(rating);

    if (author.length < 2) {
      return res.status(400).json({ ok: false, error: "Укажите имя (от 2 символов)." });
    }
    if (text.length < 10) {
      return res.status(400).json({ ok: false, error: "Текст отзыва — не менее 10 символов." });
    }

    const list = await readReviews();
    const item = {
      id:
        Date.now().toString(36) +
        Math.random()
          .toString(36)
          .slice(2, 10),
      author,
      text,
      rating,
      createdAt: new Date().toISOString(),
    };
    list.unshift(item);
    await writeReviews(list.slice(0, MAX_REVIEWS));
    res.json({ ok: true, review: item });
  } catch (e) {
    console.error("reviews post:", e);
    res.status(500).json({ ok: false, error: "Не удалось сохранить отзыв." });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Сервер: http://localhost:${PORT}`);
});
