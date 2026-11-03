const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  try {
    // 桌面尺寸
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await page.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);
    // 进入对战模式
    const duelBtn = page.locator("button", { hasText: "影片对战" }).first();
    if (await duelBtn.count()) {
      await duelBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "duel-desktop.png" });
      console.log("desktop screenshot saved");
    } else {
      console.log("duel entry button not found");
      await page.screenshot({ path: "duel-desktop.png" });
    }

    // 窄屏
    const page2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page2.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page2.waitForTimeout(3000);
    const duelBtn2 = page2.locator("button", { hasText: "影片对战" }).first();
    if (await duelBtn2.count()) {
      await duelBtn2.click();
      await page2.waitForTimeout(3000);
      await page2.screenshot({ path: "duel-narrow.png", fullPage: false });
      console.log("narrow screenshot saved");
    }
  } catch (e) {
    console.error("ERROR:", e.message);
  } finally {
    await browser.close();
  }
})();
