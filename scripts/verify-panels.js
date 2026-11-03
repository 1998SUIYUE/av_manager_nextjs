const { chromium } = require("playwright");

// 复现用户操作：点顶栏"重复"chip，观察面板是否可见
(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
    await page.goto("http://localhost:3000/movies-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);

    const chip = page.locator("button", { hasText: "重复" }).first();
    const disabled = await chip.isDisabled();
    console.log("重复 chip disabled:", disabled);
    await chip.click();
    await page.waitForTimeout(1500); // 等 smooth scroll 完成
    await page.screenshot({ path: "dup-clicked.png" });

    // 检查面板 DOM 状态
    const info = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll("section"));
      const dup = sections.find((s) => s.textContent.includes("Duplicates"));
      if (!dup) return { found: false };
      const rect = dup.getBoundingClientRect();
      const style = getComputedStyle(dup);
      return {
        found: true,
        rect: { top: Math.round(rect.top), height: Math.round(rect.height), width: Math.round(rect.width) },
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        overflow: style.overflow,
      };
    });
    console.log("面板状态:", JSON.stringify(info));

    // 演员面板也点一下
    const chip2 = page.locator("button", { hasText: "演员" }).first();
    const disabled2 = await chip2.isDisabled();
    console.log("演员 chip disabled:", disabled2);
    await chip2.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "actress-clicked.png" });
    console.log("screenshots saved");
  } catch (e) {
    console.error("ERR:", e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
})();
