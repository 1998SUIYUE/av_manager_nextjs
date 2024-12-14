import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();
    console.log('收到删除文件请求:', filePath);
    // 验证文件路径
    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ 
        error: '无效的文件路径' 
      }, { status: 400 });
    }

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ 
        error: '文件不存在' 
      }, { status: 404 });
    }

    // 删除文件
    fs.unlinkSync(filePath);
    return NextResponse.json({ 
      message: '文件已删除',
      filePath 
    });
  } catch (error) {
    console.log('删除文件时发生错误:', error);
    return NextResponse.json({ 
      error: '无法删除文件' 
    }, { status: 500 });
  }
}
