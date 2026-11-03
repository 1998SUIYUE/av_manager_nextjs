const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
    const page = await browser.newPage();
    try {
      await page.goto(origin + "/movies-v2", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(1500);
      const val = await page.evaluate(() => localStorage.getItem("movies-v2:appearance:v1"));
      console.log(origin, "=>", val ? val.slice(0, 100) : "NULL(未保存或已被清)");
    } catch (e) {
      console.log(origin, "ERROR:", e.message.split("\n")[0]);
    }
    await page.close();
  }
  await browser.close();
})();
