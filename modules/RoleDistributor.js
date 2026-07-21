// 智能身份分配器
class RoleDistributor {
  constructor(scriptManager) {
    this.scriptManager = scriptManager;
  }
  
  // 根据人数计算身份配置
  calculateRoleCount(playerCount) {
    // 标准配置表
    const configs = {
      5: { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
      6: { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
      7: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
      8: { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
      9: { townsfolk: 5, outsiders: 2, minions: 1, demons: 1 },
      10: { townsfolk: 7, outsiders: 0, minions: 2, demons: 1 },
      11: { townsfolk: 7, outsiders: 1, minions: 2, demons: 1 },
      12: { townsfolk: 7, outsiders: 2, minions: 2, demons: 1 },
      13: { townsfolk: 9, outsiders: 0, minions: 3, demons: 1 },
      14: { townsfolk: 9, outsiders: 1, minions: 3, demons: 1 },
      15: { townsfolk: 9, outsiders: 2, minions: 3, demons: 1 }
    };
    
    return configs[playerCount] || configs[10];
  }
  
  // 智能分配身份
  isTravelerRole(role) {
    const value = String(role?.type || role?.team || role?.category || '').toLowerCase();
    return value === 'traveler' || value === 'traveller';
  }

  getAssignableCharacters(script, type) {
    return (script.characters[type] || []).filter((role) => !this.isTravelerRole(role));
  }
  
  distributeRoles(playerCount, scriptId) {
    const script = this.scriptManager.getScript(scriptId);
    if (!script) {
      throw new Error(`剧本不存在: ${scriptId}`);
    }
    
    const config = this.calculateRoleCount(playerCount);
    let attempts = 0;
    let roles = null;
    
    // 最多尝试10次
    while (attempts < 10) {
      roles = this.generateRoles(script, config);
      
      // 检查平衡性
      if (this.checkBalance(roles, script.balanceRules, playerCount)) {
        break;
      }
      
      attempts++;
    }
    
    if (!roles) {
      // 如果10次都失败，返回最后一次的结果
      roles = this.generateRoles(script, config);
    }
    
    // 随机分配座位
    roles = this.shuffle(roles);
    
    // 再次检查邻座关系
    const balanceScore = this.calculateBalanceScore(roles, script.balanceRules, playerCount);
    
    return {
      roles,
      config,
      balanceScore,
      attempts
    };
  }
  
  // 生成角色列表
  generateRoles(script, config) {
    const roles = [];
    
    // 随机选择镇民
    const selectedTownsfolk = this.randomSelect(
      this.getAssignableCharacters(script, 'townsfolk'),
      config.townsfolk
    );
    roles.push(...selectedTownsfolk);
    
    // 随机选择外来者
    const selectedOutsiders = this.randomSelect(
      this.getAssignableCharacters(script, 'outsiders'),
      config.outsiders
    );
    roles.push(...selectedOutsiders);
    
    // 随机选择爪牙
    const selectedMinions = this.randomSelect(
      this.getAssignableCharacters(script, 'minions'),
      config.minions
    );
    roles.push(...selectedMinions);
    
    // 随机选择恶魔
    const selectedDemons = this.randomSelect(
      this.getAssignableCharacters(script, 'demons'),
      config.demons
    );
    roles.push(...selectedDemons);
    
    return roles;
  }
  
  // 从数组中随机选择n个元素
  randomSelect(array, count) {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
  
  // 洗牌算法
  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  
  // 检查平衡性
  checkBalance(roles, rules, playerCount) {
    if (!rules || !rules.avoid) return true;
    
    // 检查避免规则
    for (const rule of rules.avoid) {
      if (rule.type === 'neighbor') {
        if (this.violatesNeighborRule(roles, rule, playerCount)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  // 检查邻座规则
  violatesNeighborRule(roles, rule, playerCount) {
    for (let i = 0; i < roles.length; i++) {
      if (roles[i].id === rule.role) {
        const leftIndex = i === 0 ? roles.length - 1 : i - 1;
        const rightIndex = i === roles.length - 1 ? 0 : i + 1;
        
        const leftRole = roles[leftIndex];
        const rightRole = roles[rightIndex];
        
        // 检查左右邻座是否是恶魔
        if (rule.neighbor === 'demon') {
          if (this.isDemon(leftRole) || this.isDemon(rightRole)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }
  
  // 判断是否是恶魔
  isDemon(role) {
    const demonIds = ['imp', 'fang-gu', 'no-dashii', 'vigormortis', 'vortox'];
    return demonIds.includes(role.id);
  }
  
  // 计算平衡性评分
  calculateBalanceScore(roles, rules, playerCount) {
    let score = 1.0;
    
    // 检查避免规则
    if (rules && rules.avoid) {
      for (const rule of rules.avoid) {
        if (rule.type === 'neighbor') {
          if (this.violatesNeighborRule(roles, rule, playerCount)) {
            score -= 0.3;
          }
        }
      }
    }
    
    // 检查信息角色分散度
    const infoRoles = ['fortune-teller', 'empath', 'chef', 'investigator', 'librarian', 'washerwoman'];
    const infoPositions = [];
    
    roles.forEach((role, index) => {
      if (infoRoles.includes(role.id)) {
        infoPositions.push(index);
      }
    });
    
    // 如果信息角色过于集中，降低评分
    if (infoPositions.length >= 2) {
      for (let i = 0; i < infoPositions.length - 1; i++) {
        const distance = Math.abs(infoPositions[i] - infoPositions[i + 1]);
        if (distance <= 2) {
          score -= 0.1;
        }
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  // 获取角色类型
  getRoleType(role) {
    const types = {
      townsfolk: '镇民',
      outsiders: '外来者',
      minions: '爪牙',
      demons: '恶魔'
    };
    
    return types[role.type] || '未知';
  }
}

module.exports = RoleDistributor;
