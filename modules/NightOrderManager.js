// 夜间行动管理器
class NightOrderManager {
  constructor(scriptManager) {
    this.scriptManager = scriptManager;
  }
  
  // 生成夜间行动队列
  generateNightQueue(players, scriptId, isFirstNight) {
    const script = this.scriptManager.getScript(scriptId);
    if (!script) {
      throw new Error(`剧本不存在: ${scriptId}`);
    }
    
    const order = isFirstNight ? script.nightOrder.first : script.nightOrder.other;
    const queue = [];
    let orderIndex = 1;
    
    for (const roleId of order) {
      // 跳过特殊标记
      if (roleId === 'dusk' || roleId === 'dawn') {
        continue;
      }
      
      // 处理恶魔和爪牙信息
      if (roleId === 'demon-info' || roleId === 'minion-info') {
        queue.push({
          order: orderIndex++,
          roleId: roleId,
          type: 'info',
          status: 'pending',
          description: roleId === 'demon-info' ? '恶魔查看爪牙' : '爪牙查看恶魔和其他爪牙'
        });
        continue;
      }
      
      // 处理酒鬼
      if (roleId === 'drunk') {
        const drunkPlayer = players.find(p => p.role === 'drunk' && p.alive);
        if (drunkPlayer) {
          queue.push({
            order: orderIndex++,
            roleId: 'drunk',
            seat: drunkPlayer.seat,
            type: 'setup',
            status: 'pending',
            description: '告知酒鬼假身份'
          });
        }
        continue;
      }
      
      // 查找拥有该角色的玩家
      const player = players.find(p => p.role === roleId && p.alive);
      if (!player) continue;
      
      // 获取角色配置
      const character = this.scriptManager.findCharacter(scriptId, roleId);
      if (!character) continue;
      
      // 检查是否应该行动
      if (isFirstNight && !character.firstNight) continue;
      if (!isFirstNight && !character.otherNights) continue;
      
      queue.push({
        order: orderIndex++,
        roleId: roleId,
        seat: player.seat,
        character: {
          id: character.id,
          name: character.name,
          nameEn: character.nameEn,
          ability: character.ability,
          actionType: character.actionType
        },
        status: 'pending',
        action: null,
        result: null
      });
    }
    
    return queue;
  }
  
  // 更新行动状态
  updateActionStatus(queue, seat, status) {
    const action = queue.find(a => a.seat === seat && a.status !== 'completed');
    if (action) {
      action.status = status;
    }
    return queue;
  }
  
  // 获取当前应处理的行动
  getCurrentAction(queue) {
    return queue.find(a => a.status === 'pending' || a.status === 'waiting');
  }
  
  // 获取下一个行动
  getNextAction(queue) {
    const currentIndex = queue.findIndex(a => a.status === 'waiting');
    if (currentIndex === -1) {
      return queue.find(a => a.status === 'pending');
    }
    
    // 标记当前为完成，返回下一个
    if (currentIndex < queue.length - 1) {
      return queue[currentIndex + 1];
    }
    
    return null;
  }
  
  // 检查是否所有行动都已完成
  isAllCompleted(queue) {
    return queue.every(a => a.status === 'completed');
  }
  
  // 获取进度
  getProgress(queue) {
    const completed = queue.filter(a => a.status === 'completed').length;
    const total = queue.length;
    return { completed, total, percentage: (completed / total * 100).toFixed(0) };
  }
}

module.exports = NightOrderManager;
