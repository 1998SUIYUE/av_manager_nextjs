// 简单的评分系统测试脚本
// 可以在浏览器控制台中运行

console.log("🎯 Elo评分系统调试工具");

// 测试Elo计算函数
function testEloCalculation() {
  console.log("📊 测试Elo计算...");
  
  // 模拟计算函数
  function calculateEloChange(eloA, eloB, result, matchCountA, matchCountB) {
    const getKFactor = (matchCount) => {
      if (matchCount < 10) return 40;
      if (matchCount < 30) return 32;
      return 24;
    };
    
    const kA = getKFactor(matchCountA);
    const kB = getKFactor(matchCountB);
    
    const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const expectedB = 1 - expectedA;
    
    let actualA, actualB;
    switch (result) {
      case 'A_WINS': actualA = 1; actualB = 0; break;
      case 'B_WINS': actualA = 0; actualB = 1; break;
      case 'DRAW': actualA = 0.5; actualB = 0.5; break;
    }
    
    return {
      changeA: Math.round(kA * (actualA - expectedA)),
      changeB: Math.round(kB * (actualB - expectedB))
    };
  }
  
  // 测试用例
  const testCases = [
    { eloA: 1000, eloB: 1000, result: 'A_WINS', matchCountA: 0, matchCountB: 0 },
    { eloA: 1200, eloB: 1000, result: 'B_WINS', matchCountA: 5, matchCountB: 5 },
    { eloA: 1000, eloB: 1000, result: 'DRAW', matchCountA: 15, matchCountB: 15 },
  ];
  
  testCases.forEach((test, index) => {
    const result = calculateEloChange(test.eloA, test.eloB, test.result, test.matchCountA, test.matchCountB);
    console.log(`测试 ${index + 1}:`, {
      输入: test,
      输出: result,
      新评分A: test.eloA + result.changeA,
      新评分B: test.eloB + result.changeB
    });
  });
}

// 测试API连接
async function testRatingAPI() {
  console.log("🔌 测试评分API...");
  
  try {
    const response = await fetch('/api/movies/rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        movieACode: 'TEST-001',
        movieBCode: 'TEST-002',
        result: 'A_WINS'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log("✅ API测试成功:", data);
    } else {
      console.log("❌ API测试失败:", response.status, response.statusText);
    }
  } catch (error) {
    console.log("❌ API连接错误:", error);
  }
}

// 检查前端状态
function checkFrontendState() {
  console.log("🖥️ 检查前端状态...");
  
  // 检查是否有对比按钮
  const comparisonButton = document.querySelector('button:contains("🆚 开始评分")');
  console.log("对比按钮:", comparisonButton ? "✅ 存在" : "❌ 不存在");
  
  // 检查是否有评分排序按钮
  const sortButton = document.querySelector('button:contains("按评分排序")');
  console.log("评分排序按钮:", sortButton ? "✅ 存在" : "❌ 不存在");
  
  // 检查电影卡片
  const movieCards = document.querySelectorAll('[class*="bg-gray-800"]');
  console.log(`电影卡片数量: ${movieCards.length}`);
}

// 运行所有测试
function runAllTests() {
  console.log("🚀 开始运行所有测试...");
  testEloCalculation();
  checkFrontendState();
  // testRatingAPI(); // 需要实际的电影数据才能测试
  console.log("✅ 测试完成！");
}

// 导出测试函数
if (typeof window !== 'undefined') {
  window.debugRating = {
    testEloCalculation,
    testRatingAPI,
    checkFrontendState,
    runAllTests
  };
  console.log("💡 使用方法: debugRating.runAllTests()");
}

export { testEloCalculation, testRatingAPI, checkFrontendState, runAllTests };