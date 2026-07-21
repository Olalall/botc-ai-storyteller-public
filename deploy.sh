#!/bin/bash

echo "========================================"
echo "  血染钟楼 - 服务器部署脚本"
echo "========================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未安装 Node.js"
    echo "请先安装: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo "✅ NPM 版本: $(npm -v)"
echo ""

# 安装依赖
echo "📦 安装依赖..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi
echo "✅ 依赖安装完成"
echo ""

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 安装 PM2..."
    npm install -g pm2
fi

# 停止旧进程
echo "🔄 停止旧进程..."
pm2 stop blood-game 2>/dev/null
pm2 delete blood-game 2>/dev/null

# 启动服务
echo "🚀 启动服务..."
pm2 start server.js --name blood-game

# 保存配置
pm2 save

# 设置开机自启
pm2 startup | tail -n 1 | bash

echo ""
echo "========================================"
echo "  ✅ 部署完成！"
echo "========================================"
echo ""
pm2 list
echo ""
echo "📱 访问地址:"
echo "  说书人: http://你的服务器IP:3000/storyteller.html"
echo "  玩家:   http://你的服务器IP:3000/player.html"
echo ""
echo "📝 常用命令:"
echo "  pm2 list          - 查看状态"
echo "  pm2 logs          - 查看日志"
echo "  pm2 restart blood-game - 重启服务"
echo "  pm2 stop blood-game    - 停止服务"
echo ""
