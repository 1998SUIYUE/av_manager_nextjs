const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    await page.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    // 点击第一张影片卡片（article 根元素带 onClick）
    const card = page.locator("article").first();
    const box = await card.boundingBox();
    if (!box) throw new Error("card not found");
    console.log("card box:", JSON.stringify(box));
    await page.mouse.click(box.x + box.width / 2, box.y + 60);
    await page.waitForTimeout(9000);
    const hasVideo = await page.evaluate(() => document.querySelectorAll("video").length);
    console.log("video elements in DOM:", hasVideo);
    // 鼠标移开，验证顶部信息浮层 hover 门控
    await page.mouse.move(20, 880);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "player-aspect.png" });
    console.log("player screenshot saved");
  } catch (e) {
    console.error("PLAYWRIGHT ERROR:", e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
})();
