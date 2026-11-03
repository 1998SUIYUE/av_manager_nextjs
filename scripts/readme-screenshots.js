const { chromium } = require("playwright");

// README 截图：影片库主页（打包版服务 3100 端口）
(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  try {
    require("fs").mkdirSync("docs/images", { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
    await page.goto("http://127.0.0.1:3100/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: "docs/images/library.png" });
    console.log("library screenshot saved");
  } catch (e) {
    console.error("ERR:", e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
})();
