const { chromium } = require("playwright");

// 生成 README 截图 → docs/images/
(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const fs = require("fs");
  fs.mkdirSync("docs/images", { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });

    // 1. 影片库主页
    await page.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: "docs/images/library.png" });

    // 2. 外观面板
    await page.locator("button", { hasText: "外观" }).first().click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "docs/images/appearance.png" });
    await page.keyboard.press("Escape");
    await page.locator("button[aria-label='关闭外观设置']").first().click();
    await page.waitForTimeout(500);

    // 3. 播放器弹窗
    const card = page.locator("article").first();
    const box = await card.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + 60);
    await page.waitForTimeout(9000);
    await page.mouse.move(20, 980); // 移开鼠标，验证 hover 门控后截图
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "docs/images/player.png" });
    // 关闭播放器（点 X 按钮，弹窗没有 Escape 处理）
    await page.locator("button[aria-label='关闭播放器']").first().click();
    await page.waitForTimeout(800);

    // 4. 影片对战页
    const duelBtn = page.locator("button", { hasText: "影片对战" }).first();
    if (await duelBtn.count()) {
      await duelBtn.click();
      await page.waitForTimeout(6000);
      await page.screenshot({ path: "docs/images/duel.png" });
    }
    console.log("README screenshots saved");
  } catch (e) {
    console.error("ERROR:", e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
})();
