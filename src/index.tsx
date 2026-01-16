import { Hono } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createHash } from "crypto";
import * as s from "./schema";
import { and, eq } from "drizzle-orm";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";

const app = new Hono();
const db = drizzle("./vote.db");
const cookieSecret = process.env.COOKIE_SECRET ||
  (typeof Bun !== "undefined" ? Bun.env.COOKIE_SECRET : "") ||
  (() => {
    throw new Error("COOKIE_SECRET is not set");
  })();

app.use(logger());
app.use("/script.js", serveStatic({ path: "./src/script.js" }));
app.use(
  "*",
  jsxRenderer(({ children }) => {
    return (
      <html>
        <header>
          <meta charSet="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>Vote</title>
        </header>
        <body>
          {children}
        </body>
      </html>
    );
  }),
);

// 安定したヘッダーのみを使ってサーバー側フィンガープリントを計算（CF-Rayなど毎回変わる値は除外）
const buildServerFingerprint = (req: Request) => {
  const headers = req.headers;
  const ip =
    (headers.get("cf-connecting-ip") || headers.get("x-forwarded-for") || "")
      .split(",")[0]?.trim();
  const country = headers.get("cf-ipcountry") || "";
  const ua = headers.get("user-agent") || "";
  const lang = headers.get("accept-language") || "";

  const payload = JSON.stringify({ ip, country, ua, lang });
  return createHash("sha256").update(payload).digest("hex");
};

// クライアント側フィンガープリントをハッシュ化
const hashClientFingerprint = (clientFp: string) => {
  return createHash("sha256").update(clientFp).digest("hex");
};

// ホームページ（UIとクライアント側スクリプト）
app.get("/", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>投票システム</title>
      <script defer src="https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs/dist/fp.umd.min.js"></script>
      <style>
        * { box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
          margin: 0; 
          padding: 20px; 
          background: #f5f5f5;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-top: 0; }
        .vote-container { 
          margin: 30px 0; 
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        button { 
          padding: 12px 24px; 
          cursor: pointer;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.3s;
        }
        button:hover { background: #0056b3; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        #status { 
          margin-top: 20px; 
          padding: 15px; 
          background: #f8f9fa; 
          border-left: 4px solid #007bff;
          border-radius: 4px;
          font-size: 14px;
          line-height: 1.6;
        }
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .info { color: #17a2b8; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🗳️ 投票システムテスト</h1>
        <div id="status" class="info">初期化中...</div>
        <div id="voted-status" style="margin-top: 15px; display: none;"></div>
        <div class="vote-container" id="vote-buttons">
          <button onclick="vote('option1')">選択肢1に投票</button>
          <button onclick="vote('option2')">選択肢2に投票</button>
          <button onclick="vote('option3')">選択肢3に投票</button>
        </div>
      </div>

      <script defer src="/script.js"></script>
    </body>
    </html>
  `);
});

// 初期化エンドポイント: クライアントフィンガープリント受け取り、セッション情報を返す
app.post("/init", async (c) => {
  try {
    if (!cookieSecret) {
      return c.json({ message: "COOKIE_SECRET is not set" }, 500);
    }
    const body = await c.req.json();
    const clientFp = body.clientFingerprint;
    if (!clientFp) {
      return c.json({ message: "clientFingerprint required" }, 400);
    }

    const serverFp = buildServerFingerprint(c.req.raw);
    const hashedClientFp = hashClientFingerprint(clientFp);

    // 同じサーバーFPとクライアントFP両方の組み合わせが既に存在するかチェック
    const existingUser = await db.select().from(s.user).where(
      and(
        eq(s.user.serverFingerprint, serverFp),
        eq(s.user.clientFingerprint, hashedClientFp),
      ),
    ).limit(1);

    if (existingUser.length > 0) {
      // 初期化済み：fingerプリントのみCookieに保存
      await setSignedCookie(c, "serverFp", serverFp, cookieSecret, {
        maxAge: 24 * 60 * 60,
        secure: false,
        sameSite: "Lax",
      });
      await setSignedCookie(c, "clientFp", hashedClientFp, cookieSecret, {
        maxAge: 24 * 60 * 60,
        secure: false,
        sameSite: "Lax",
      });

      return c.json({
        initialized: true,
        message: "初期化済みです",
      });
    }

    // 新規ユーザー：fingerプリントのみCookieに保存
    await setSignedCookie(c, "serverFp", serverFp, cookieSecret, {
      maxAge: 24 * 60 * 60,
      secure: false,
      sameSite: "Lax",
    });
    await setSignedCookie(c, "clientFp", hashedClientFp, cookieSecret, {
      maxAge: 24 * 60 * 60,
      secure: false,
      sameSite: "Lax",
    });

    return c.json({
      initialized: false,
    });
  } catch (e) {
    console.error("Init error:", e);
    return c.json({ message: "Internal error" }, 500);
  }
});

// 投票エンドポイント: Cookieを検証して投票を受け付ける
app.post("/vote", async (c) => {
  try {
    if (!cookieSecret) {
      return c.json({ message: "COOKIE_SECRET is not set" }, 500);
    }
    const body = await c.req.json();
    const voteOption = body.voteOption;
    if (!voteOption) {
      return c.json({ message: "voteOption required" }, 400);
    }

    // Cookieからフィンガープリントを取得
    const cookieServerFp = await getSignedCookie(c, cookieSecret, "serverFp");
    const cookieClientFp = await getSignedCookie(c, cookieSecret, "clientFp");

    console.log(cookieServerFp, cookieClientFp);

    if (!cookieServerFp || !cookieClientFp) {
      return c.json({ message: "未初期化です。先に初期化してください" }, 401);
    }

    // 現在のリクエストのサーバーFPと比較（同じIP/User-Agentなどか確認）
    const currentServerFp = buildServerFingerprint(c.req.raw);
    if (currentServerFp !== cookieServerFp) {
      return c.json(
        { message: "異なる環境からのアクセスが検出されました" },
        403,
      );
    }

    // DB内でフィンガープリントを使ってユーザーを検索
    const existingVote = await db.select().from(s.user).where(
      and(
        eq(s.user.serverFingerprint, cookieServerFp),
        eq(s.user.clientFingerprint, cookieClientFp),
      ),
    ).limit(1);

    if (existingVote.length > 0 && existingVote[0].vote) {
      return c.json({ message: "既に投票済みです" }, 409);
    }

    // 投票を保存
    const now = new Date();
    if (existingVote.length > 0) {
      // 更新
      await db.update(s.user)
        .set({ vote: voteOption })
        .where(
          and(
            eq(s.user.serverFingerprint, cookieServerFp),
            eq(s.user.clientFingerprint, cookieClientFp),
          ),
        );
    } else {
      // 新規作成
      const userId = crypto.randomUUID();
      await db.insert(s.user).values({
        id: userId,
        serverFingerprint: cookieServerFp,
        clientFingerprint: cookieClientFp,
        vote: voteOption,
        createdAt: now,
      });
    }

    return c.json({ message: "投票が完了しました：" + voteOption });
  } catch (e) {
    console.error("Vote error:", e);
    return c.json({ message: "Internal error" }, 500);
  }
});

// 投票状況確認エンドポイント
app.get("/check-vote", async (c) => {
  try {
    if (!cookieSecret) {
      return c.json({ hasVoted: false, vote: null }, 200);
    }
    const cookieServerFp = await getSignedCookie(c, cookieSecret, "serverFp");
    const cookieClientFp = await getSignedCookie(c, cookieSecret, "clientFp");

    if (!cookieServerFp || !cookieClientFp) {
      return c.json({ hasVoted: false, vote: null }, 200);
    }

    // 投票情報をDBからフィンガープリントで検索
    const voteRecord = await db.select().from(s.user).where(
      and(
        eq(s.user.serverFingerprint, cookieServerFp),
        eq(s.user.clientFingerprint, cookieClientFp),
      ),
    ).limit(1);

    if (voteRecord.length > 0 && voteRecord[0].vote) {
      return c.json({
        hasVoted: true,
        vote: voteRecord[0].vote,
      }, 200);
    }

    return c.json({ hasVoted: false, vote: null }, 200);
  } catch (e) {
    console.error("Check vote error:", e);
    return c.json({ hasVoted: false, vote: null }, 200);
  }
});

// テスト用: サーバー側フィンガープリントを返す
app.get("/server-fingerprint", (c) => {
  const fingerprint = buildServerFingerprint(c.req.raw);
  return c.json({ fingerprint });
});

export default app;
