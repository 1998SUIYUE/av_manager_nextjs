const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
    await page.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: "layout-c.png" });

    const page2 = await browser.newPage({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 1.5 });
    await page2.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page2.waitForTimeout(5000);
    await page2.screenshot({ path: "layout-c-mid.png" });
    console.log("layout screenshots saved");
  } catch (e) {
    console.error("ERR:", e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
})();
