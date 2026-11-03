const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  try {
    // 桌面
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    await page.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: "header-desktop.png", clip: { x: 0, y: 0, width: 1440, height: 420 } });

    // 窄屏（内容换行/堆叠压力测试）
    const page2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page2.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page2.waitForTimeout(4000);
    await page2.screenshot({ path: "header-narrow.png", clip: { x: 0, y: 0, width: 390, height: 560 } });
    console.log("header screenshots saved");
  } catch (e) {
    console.error("ERROR:", e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
})();
