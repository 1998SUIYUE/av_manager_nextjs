const { chromium } = require("playwright");

(async () => {
  // 1) appearance API 读写往返（POST 当前 GET 到的值，不改变用户可见状态）
  const get1 = await fetch("http://localhost:3000/api/appearance");
  console.log("GET /api/appearance =>", get1.status, await get1.text());
  const current = await get1.json();
  const post = await fetch("http://localhost:3000/api/appearance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(current),
  });
  console.log("POST roundtrip =>", post.status);
  const get2 = await fetch("http://localhost:3000/api/appearance");
  console.log("GET again =>", get2.status, JSON.stringify(await get2.json()).slice(0, 80));

  // 2) 播放器黑边验证：打开影片库 → 点第一张卡片进播放器 → 截图
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    await page.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);
    // 点击第一张影片卡片（播放器打开）
    const card = page.locator("img, [class*='cursor-pointer']").first();
    await card.click();
    await page.waitForTimeout(8000); // 等元数据加载 + 弹窗按比例收缩
    await page.screenshot({ path: "player-aspect.png" });
    console.log("player screenshot saved");
  } catch (e) {
    console.error("PLAYWRIGHT ERROR:", e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
})();
