const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  try {
    // 影片库封面
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    await page.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000); // 等封面加载
    await page.screenshot({ path: "covers-library.png", clip: { x: 0, y: 0, width: 1440, height: 900 } });

    // 对战页封面：进入对战模式
    const duelBtn = page.locator("button", { hasText: "影片对战" }).first();
    await duelBtn.click();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: "covers-duel.png" });
    console.log("cover screenshots saved");
  } catch (e) {
    console.error("ERROR:", e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
})();
