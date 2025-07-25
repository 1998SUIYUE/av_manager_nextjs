const axios = require('axios');
const cheerio = require('cheerio'); // 用于解析HTML内容
const { HttpsProxyAgent } = require('https-proxy-agent'); // 导入代理模块
const { time } = require('node:console');
const fs = require('node:fs/promises'); // 导入fs/promises模块用于文件操作
const path = require('node:path'); // 导入path模块用于处理路径

async function testJavBusScrape(code) {
  const url = `https://www.javbus.com/${code}`;
  
  // !!! 请确保您的本地代理正在运行，并且端口正确 !!!
  const proxyUrl = 'http://127.0.0.1:9890'; 
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

  try {
    const response = await axios.get(url, {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'cache-control': 'max-age=0',
        // 这里的PHPSESSID请注意，它可能很快过期，如果测试失败，尝试从浏览器重新获取最新的PHPSESSID
        'cookie': 'PHPSESSID=idet27h6gk7o9i9sq71p6kec66; existmag=mag', 
        'priority': 'u=0, i',
        'referer': 'https://www.javbus.com/',
        'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin', 
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      },
      timeout: 15000, // 增加超时时间到15秒
      httpsAgent: agent, // 添加代理配置
      httpAgent: agent,  // 也为http请求添加代理
    });

    // 使用cheerio解析HTML，确认是否获取到正确的内容
    const $ = cheerio.load(response.data);
    const title = $('body > div.container > h3').text().trim();
    const actress = $('body > div.container > div.row.movie > div.col-md-3.info > p:last-child > span > a').text().trim();
    const coverUrlPart = $('body > div.container > div.row.movie > div.col-md-9.screencap > a > img').attr('src');
    const coverUrl = coverUrlPart ? `https://www.javbus.com${coverUrlPart}` : '未找到封面';

    // --- 下载图片逻辑开始 ---
    if (coverUrl && coverUrl !== '未找到封面') {
        const downloadsDir = path.join(__dirname, 'downloads');
        await fs.mkdir(downloadsDir, { recursive: true }); // 确保下载目录存在

        const imageUrl = coverUrl;
        const imageExtension = path.extname(new URL(imageUrl).pathname) || '.jpg';
        const imageFileName = `${code}${imageExtension}`;
        const imageFilePath = path.join(downloadsDir, imageFileName);

        try {
            const imageResponse = await axios.get(imageUrl, {
                responseType: 'arraybuffer', // 获取二进制数据
                timeout: 15000, // 图片下载超时
                httpsAgent: agent, // 使用相同的代理
                httpAgent: agent,
                headers: { // 为图片下载添加相同的请求头
                    'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'cookie': 'PHPSESSID=idet27h6gk7o9i9sq71p6kec66; existmag=mag', 
                    'referer': `https://www.javbus.com/${code}`, // 图片的referer应该是其所属页面的URL
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
                    'sec-fetch-dest': 'image',
                    'sec-fetch-mode': 'no-cors', // 跨域图片请求通常是no-cors
                    'sec-fetch-site': 'same-origin',
                },
            });
            await fs.writeFile(imageFilePath, Buffer.from(imageResponse.data));
            console.log(`🖼️ 图片下载成功: ${imageFilePath}`);
        } catch (imageError) {
            console.error(`❌ 图片下载失败 (${imageUrl}): ${imageError.message}`);
        }
    }
    // --- 下载图片逻辑结束 ---

    return { success: true, status: response.status, title, actress, coverUrl };

  } catch (error) {
    let status = 'N/A';
    let errorMessage = error.message;

    if (error.response) {
      status = error.response.status;
      errorMessage = `请求失败，状态码: ${status}`;
      if (error.response.data) {
        errorMessage += `\n响应数据 (前500字符): ${String(error.response.data).substring(0, 500)}`;
      }
    } else if (error.request) {
      errorMessage = '没有收到响应 (可能超时或网络错误)';
    } else {
      errorMessage = `发送请求时出错: ${error.message}`;
    }
    return { success: false, status, errorMessage };
  }
}

async function testScrapeFrequency(code, maxAttempts, delayMs) {
  console.log(`\n--- 开始频率测试 ---\n`);
  console.log(`目标番号: ${code}`);
  console.log(`最大尝试次数: ${maxAttempts}`);
  console.log(`每次请求间隔: ${delayMs} 毫秒`);

  let successfulAttempts = 0;
  let blockedAttempts = 0;
  let otherFailures = 0;

  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`\n--- 尝试 ${i}/${maxAttempts} ---\n`);
    console.time('myTask');
    const result = await testJavBusScrape(code);

    if (result.success) {
      successfulAttempts++;
      console.log(`✅ 成功获取！状态码: ${result.status}`);
      console.log(`标题: ${result.title}, 女优: ${result.actress}`);
      console.timeEnd('myTask');
    } else {
      if (result.status === 403) { // 假设403是常见的被阻止状态码
        blockedAttempts++;
        console.error(`❌ 被阻止！状态码: ${result.status}, 错误: ${result.errorMessage}`);
      } else {
        otherFailures++;
        console.error(`⚠️ 请求失败！状态码: ${result.status}, 错误: ${result.errorMessage}`);
      }
    }

    if (i < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs)); // 每次请求之间的延迟
    }
    
  }

  console.log(`\n--- 频率测试结果 ---\n`);
  console.log(`总尝试次数: ${maxAttempts}`);
  console.log(`成功次数: ${successfulAttempts}`);
  console.log(`被阻止次数 (例如403): ${blockedAttempts}`);
  console.log(`其他失败次数: ${otherFailures}`);
  console.log(`--------------------\n`);
}

// ===============================================
// === 配置您的测试参数 (请根据需要修改) ===
// ===============================================
const TEST_CODE = 'ROYD-250'; // 您要测试的电影番号
const MAX_ATTEMPTS = 15;     // 总共尝试多少次请求
const REQUEST_DELAY_MS = 0; // 每次请求之间的延迟（毫秒）。例如：1000 = 1秒，5000 = 5秒。

// 运行频率测试
testScrapeFrequency(TEST_CODE, MAX_ATTEMPTS, REQUEST_DELAY_MS);