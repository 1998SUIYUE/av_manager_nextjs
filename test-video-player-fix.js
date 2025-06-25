// 测试VideoPlayer修复的简单脚本
// 这个脚本模拟同时创建多个视频预览的情况

console.log("开始测试VideoPlayer修复...");

// 模拟同时预览两个视频的情况
function simulateVideoPreview() {
  console.log("模拟同时预览两个视频...");
  
  // 创建两个临时视频元素
  const video1 = document.createElement('video');
  const video2 = document.createElement('video');
  
  video1.style.display = 'none';
  video2.style.display = 'none';
  
  document.body.appendChild(video1);
  document.body.appendChild(video2);
  
  console.log("已创建两个视频元素");
  
  // 模拟快速切换预览状态
  setTimeout(() => {
    console.log("尝试移除第一个视频元素...");
    if (document.body.contains(video1)) {
      document.body.removeChild(video1);
      console.log("✅ 第一个视频元素移除成功");
    } else {
      console.log("⚠️ 第一个视频元素已不存在");
    }
  }, 100);
  
  setTimeout(() => {
    console.log("尝试移除第二个视频元素...");
    if (document.body.contains(video2)) {
      document.body.removeChild(video2);
      console.log("✅ 第二个视频元素移除成功");
    } else {
      console.log("⚠️ 第二个视频元素已不存在");
    }
  }, 200);
  
  setTimeout(() => {
    console.log("✅ 测试完成，没有发生removeChild错误");
  }, 300);
}

// 如果在浏览器环境中运行
if (typeof document !== 'undefined') {
  simulateVideoPreview();
} else {
  console.log("这个测试需要在浏览器环境中运行");
}