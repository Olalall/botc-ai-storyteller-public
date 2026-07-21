// 技能计算引擎
class AbilityEngine {
  constructor(scriptManager) {
    this.scriptManager = scriptManager;
    this.handlers = new Map(); // 角色ID -> 处理器函数
    this.registerDefaultHandlers();
  }
  
  // 注册技能处理器
  registerHandler(roleId, handler) {
    this.handlers.set(roleId, handler);
  }
  
  // 计算技能结果
  async calculateAbility(roleId, player, targets, gameState) {
    const handler = this.handlers.get(roleId);
    
    if (!handler) {
      return {
        success: false,
        error: `未找到角色 ${roleId} 的技能处理器`
      };
    }
    
    try {
      const result = await handler(player, targets, gameState, this);
      return {
        success: true,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 生成消息
  generateMessage(template, params) {
    let message = template;
    for (const [key, value] of Object.entries(params)) {
      message = message.replace(`{${key}}`, value);
    }
    return message;
  }
  
  // 检查玩家是否中毒或醉酒
  isPlayerImpaired(player) {
    return player.poisoned || player.drunk;
  }
  
  // 获取邻座玩家
  getNeighbors(seat, players) {
    const alivePlayers = players.filter(p => p.alive).sort((a, b) => a.seat - b.seat);
    const index = alivePlayers.findIndex(p => p.seat === seat);
    
    if (index === -1) return { left: null, right: null };
    
    const leftIndex = (index - 1 + alivePlayers.length) % alivePlayers.length;
    const rightIndex = (index + 1) % alivePlayers.length;
    
    return {
      left: alivePlayers[leftIndex],
      right: alivePlayers[rightIndex]
    };
  }
  
  // 检查玩家是否邪恶
  isEvil(player) {
    return player.alignment === 'evil';
  }
  
  // 获取玩家的真实角色（考虑酒鬼等特殊情况）
  getTrueRole(player, gameState) {
    // 如果是酒鬼，返回其假身份
    if (player.drunk && player.drunkRole) {
      return player.drunkRole;
    }
    return player.role;
  }
  
  // 注册默认处理器
  registerDefaultHandlers() {
    // 占卜师 - 查验两人是否有恶魔
    this.registerHandler('fortune-teller', (player, targets, gameState) => {
      if (this.isPlayerImpaired(player)) {
        // 中毒或醉酒，给出错误信息
        const hasDemon = Math.random() < 0.5; // 随机结果
        return {
          message: hasDemon ? '是，其中有恶魔' : '否，其中没有恶魔',
          data: { hasDemon, impaired: true }
        };
      }
      
      const target1 = gameState.players.find(p => p.seat === parseInt(targets.target1));
      const target2 = gameState.players.find(p => p.seat === parseInt(targets.target2));
      
      if (!target1 || !target2) {
        throw new Error('目标玩家不存在');
      }
      
      // 检查是否有恶魔
      const hasDemon = this.isDemon(target1) || this.isDemon(target2);
      
      return {
        message: hasDemon ? '是，其中有恶魔' : '否，其中没有恶魔',
        data: { hasDemon, target1: target1.seat, target2: target2.seat }
      };
    });
    
    // 共情者 - 邻座邪恶玩家数量
    this.registerHandler('empath', (player, targets, gameState) => {
      const neighbors = this.getNeighbors(player.seat, gameState.players);
      
      if (this.isPlayerImpaired(player)) {
        // 中毒或醉酒，给出错误信息
        const count = Math.floor(Math.random() * 3); // 0-2随机
        return {
          message: `你的邻座中有 ${count} 个邪恶玩家`,
          data: { count, impaired: true }
        };
      }
      
      let count = 0;
      if (neighbors.left && this.isEvil(neighbors.left)) count++;
      if (neighbors.right && this.isEvil(neighbors.right)) count++;
      
      return {
        message: `你的邻座中有 ${count} 个邪恶玩家`,
        data: { 
          count, 
          left: neighbors.left?.seat, 
          right: neighbors.right?.seat 
        }
      };
    });
    
    // 厨师 - 邻座邪恶玩家对数
    this.registerHandler('chef', (player, targets, gameState) => {
      if (this.isPlayerImpaired(player)) {
        const pairs = Math.floor(Math.random() * 3); // 0-2随机
        return {
          message: `场上有 ${pairs} 对邻座邪恶玩家`,
          data: { pairs, impaired: true }
        };
      }
      
      const alivePlayers = gameState.players.filter(p => p.alive).sort((a, b) => a.seat - b.seat);
      let pairs = 0;
      
      for (let i = 0; i < alivePlayers.length; i++) {
        const current = alivePlayers[i];
        const next = alivePlayers[(i + 1) % alivePlayers.length];
        
        if (this.isEvil(current) && this.isEvil(next)) {
          pairs++;
        }
      }
      
      return {
        message: `场上有 ${pairs} 对邻座邪恶玩家`,
        data: { pairs }
      };
    });
    
    // 调查员 - 两人中一个爪牙
    this.registerHandler('investigator', (player, targets, gameState) => {
      if (this.isPlayerImpaired(player)) {
        // 给出错误信息
        const players = gameState.players.filter(p => p.alive);
        const randomPlayers = this.getRandomPlayers(players, 2);
        const minionTypes = ['poisoner', 'spy', 'scarlet-woman', 'baron'];
        const randomMinion = minionTypes[Math.floor(Math.random() * minionTypes.length)];
        
        return {
          message: `${randomPlayers[0].seat}号和${randomPlayers[1].seat}号中，有一个是${this.getRoleName(randomMinion)}`,
          data: { 
            players: randomPlayers.map(p => p.seat), 
            minion: randomMinion,
            impaired: true 
          }
        };
      }
      
      // 找出所有爪牙
      const minions = gameState.players.filter(p => this.isMinion(p));
      
      if (minions.length === 0) {
        return {
          message: '场上没有爪牙',
          data: { players: [], minion: null }
        };
      }
      
      // 随机选择一个爪牙
      const targetMinion = minions[Math.floor(Math.random() * minions.length)];
      
      // 随机选择另一个玩家
      const otherPlayers = gameState.players.filter(p => p.seat !== targetMinion.seat && p.alive);
      const otherPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
      
      const pair = [targetMinion, otherPlayer].sort(() => Math.random() - 0.5);
      
      return {
        message: `${pair[0].seat}号和${pair[1].seat}号中，有一个是${targetMinion.roleName}`,
        data: { 
          players: pair.map(p => p.seat), 
          minion: targetMinion.role,
          actualMinion: targetMinion.seat
        }
      };
    });
    
    // 图书管理员 - 两人中一个外来者
    this.registerHandler('librarian', (player, targets, gameState) => {
      if (this.isPlayerImpaired(player)) {
        const players = gameState.players.filter(p => p.alive);
        const randomPlayers = this.getRandomPlayers(players, 2);
        const outsiderTypes = ['butler', 'drunk', 'recluse', 'saint'];
        const randomOutsider = outsiderTypes[Math.floor(Math.random() * outsiderTypes.length)];
        
        return {
          message: `${randomPlayers[0].seat}号和${randomPlayers[1].seat}号中，有一个是${this.getRoleName(randomOutsider)}`,
          data: { 
            players: randomPlayers.map(p => p.seat), 
            outsider: randomOutsider,
            impaired: true 
          }
        };
      }
      
      const outsiders = gameState.players.filter(p => this.isOutsider(p));
      
      if (outsiders.length === 0) {
        return {
          message: '场上没有外来者',
          data: { players: [], outsider: null }
        };
      }
      
      const targetOutsider = outsiders[Math.floor(Math.random() * outsiders.length)];
      const otherPlayers = gameState.players.filter(p => p.seat !== targetOutsider.seat && p.alive);
      const otherPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
      
      const pair = [targetOutsider, otherPlayer].sort(() => Math.random() - 0.5);
      
      return {
        message: `${pair[0].seat}号和${pair[1].seat}号中，有一个是${targetOutsider.roleName}`,
        data: { 
          players: pair.map(p => p.seat), 
          outsider: targetOutsider.role,
          actualOutsider: targetOutsider.seat
        }
      };
    });
    
    // 洗衣妇 - 两人中一个镇民
    this.registerHandler('washerwoman', (player, targets, gameState) => {
      if (this.isPlayerImpaired(player)) {
        const players = gameState.players.filter(p => p.alive);
        const randomPlayers = this.getRandomPlayers(players, 2);
        const townsfolkTypes = ['fortune-teller', 'empath', 'chef', 'investigator', 'librarian'];
        const randomTownsfolk = townsfolkTypes[Math.floor(Math.random() * townsfolkTypes.length)];
        
        return {
          message: `${randomPlayers[0].seat}号和${randomPlayers[1].seat}号中，有一个是${this.getRoleName(randomTownsfolk)}`,
          data: { 
            players: randomPlayers.map(p => p.seat), 
            townsfolk: randomTownsfolk,
            impaired: true 
          }
        };
      }
      
      const townsfolk = gameState.players.filter(p => this.isTownsfolk(p));
      
      if (townsfolk.length === 0) {
        return {
          message: '场上没有镇民',
          data: { players: [], townsfolk: null }
        };
      }
      
      const targetTownsfolk = townsfolk[Math.floor(Math.random() * townsfolk.length)];
      const otherPlayers = gameState.players.filter(p => p.seat !== targetTownsfolk.seat && p.alive);
      const otherPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
      
      const pair = [targetTownsfolk, otherPlayer].sort(() => Math.random() - 0.5);
      
      return {
        message: `${pair[0].seat}号和${pair[1].seat}号中，有一个是${targetTownsfolk.roleName}`,
        data: { 
          players: pair.map(p => p.seat), 
          townsfolk: targetTownsfolk.role,
          actualTownsfolk: targetTownsfolk.seat
        }
      };
    });
    
    // 僧侣 - 保护一人
    this.registerHandler('monk', (player, targets, gameState) => {
      const target = gameState.players.find(p => p.seat === parseInt(targets.target));
      
      if (!target) {
        throw new Error('目标玩家不存在');
      }
      
      // 标记保护状态
      target.protected = true;
      
      return {
        message: `你保护了 ${target.seat}号`,
        data: { target: target.seat },
        effect: { type: 'protect', target: target.seat }
      };
    });
    
    // 投毒者 - 中毒一人
    this.registerHandler('poisoner', (player, targets, gameState) => {
      const target = gameState.players.find(p => p.seat === parseInt(targets.target));
      
      if (!target) {
        throw new Error('目标玩家不存在');
      }
      
      // 清除所有玩家的中毒状态
      gameState.players.forEach(p => p.poisoned = false);
      
      // 标记新的中毒目标
      target.poisoned = true;
      
      return {
        message: `你对 ${target.seat}号下毒`,
        data: { target: target.seat },
        effect: { type: 'poison', target: target.seat }
      };
    });
    
    // 小恶魔 - 击杀一人
    this.registerHandler('imp', (player, targets, gameState) => {
      const target = gameState.players.find(p => p.seat === parseInt(targets.target));
      
      if (!target) {
        throw new Error('目标玩家不存在');
      }
      
      // 检查目标是否被保护
      if (target.protected) {
        target.protected = false; // 清除保护状态
        return {
          message: `你攻击了 ${target.seat}号，但被僧侣保护`,
          data: { target: target.seat, killed: false, protected: true }
        };
      }
      
      // 检查目标是否是士兵
      if (target.role === 'soldier') {
        return {
          message: `你攻击了 ${target.seat}号，但士兵免疫你的击杀`,
          data: { target: target.seat, killed: false, immune: true }
        };
      }
      
      // 击杀目标
      target.alive = false;
      
      return {
        message: `你击杀了 ${target.seat}号`,
        data: { target: target.seat, killed: true },
        effect: { type: 'kill', target: target.seat }
      };
    });
    
    // 间谍 - 看魔典
    this.registerHandler('spy', (player, targets, gameState) => {
      // 间谍可以看到所有玩家的真实身份
      const grimoire = gameState.players.map(p => ({
        seat: p.seat,
        name: p.name,
        role: p.roleName,
        alignment: p.alignment,
        alive: p.alive,
        poisoned: p.poisoned,
        drunk: p.drunk
      }));
      
      return {
        message: '你查看了魔典，看到了所有玩家的真实身份',
        data: { grimoire },
        showGrimoire: true
      };
    });
    
    // 乌鸦守卫 - 死亡后查验一人
    this.registerHandler('ravenkeeper', (player, targets, gameState) => {
      if (!player.alive) {
        // 玩家已死亡，可以查验
        const target = gameState.players.find(p => p.seat === parseInt(targets.target));
        
        if (!target) {
          throw new Error('目标玩家不存在');
        }
        
        return {
          message: `${target.seat}号的身份是 ${target.roleName}`,
          data: { 
            target: target.seat, 
            role: target.role,
            roleName: target.roleName
          }
        };
      } else {
        return {
          message: '你还活着，无法使用乌鸦守卫能力',
          data: { alive: true }
        };
      }
    });
    
    // 守夜人 - 得知被处决者身份
    this.registerHandler('undertaker', (player, targets, gameState) => {
      if (this.isPlayerImpaired(player)) {
        // 中毒或醉酒，给出错误信息
        const roles = ['fortune-teller', 'empath', 'chef', 'poisoner', 'imp'];
        const randomRole = roles[Math.floor(Math.random() * roles.length)];
        
        return {
          message: `今天被处决的玩家是 ${this.getRoleName(randomRole)}`,
          data: { role: randomRole, impaired: true }
        };
      }
      
      // 查找今天被处决的玩家
      const executed = gameState.players.find(p => p.executedToday);
      
      if (!executed) {
        return {
          message: '今天没有玩家被处决',
          data: { executed: null }
        };
      }
      
      return {
        message: `今天被处决的玩家是 ${executed.roleName}`,
        data: { 
          seat: executed.seat,
          role: executed.role,
          roleName: executed.roleName
        }
      };
    });
    
    // 管家 - 选择主人
    this.registerHandler('butler', (player, targets, gameState) => {
      const target = gameState.players.find(p => p.seat === parseInt(targets.target));
      
      if (!target) {
        throw new Error('目标玩家不存在');
      }
      
      if (target.seat === player.seat) {
        throw new Error('不能选择自己作为主人');
      }
      
      // 标记主人
      player.master = target.seat;
      
      return {
        message: `你选择了 ${target.seat}号作为你的主人`,
        data: { master: target.seat }
      };
    });
  }
  
  // 辅助方法
  isDemon(player) {
    const demonRoles = ['imp', 'fang-gu', 'no-dashii'];
    return demonRoles.includes(player.role);
  }
  
  isMinion(player) {
    const minionRoles = ['poisoner', 'spy', 'scarlet-woman', 'baron'];
    return minionRoles.includes(player.role);
  }
  
  isOutsider(player) {
    const outsiderRoles = ['butler', 'drunk', 'recluse', 'saint'];
    return outsiderRoles.includes(player.role);
  }
  
  isTownsfolk(player) {
    return player.alignment === 'good' && !this.isOutsider(player);
  }
  
  getRandomPlayers(players, count) {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
  
  getRoleName(roleId) {
    const roleNames = {
      'poisoner': '投毒者',
      'spy': '间谍',
      'scarlet-woman': '猩红女',
      'baron': '男爵',
      'butler': '管家',
      'drunk': '酒鬼',
      'recluse': '隐士',
      'saint': '圣徒',
      'fortune-teller': '占卜师',
      'empath': '共情者',
      'chef': '厨师',
      'investigator': '调查员',
      'librarian': '图书管理员',
      'washerwoman': '洗衣妇',
      'monk': '僧侣',
      'ravenkeeper': '乌鸦守卫',
      'undertaker': '守夜人',
      'imp': '小恶魔'
    };
    return roleNames[roleId] || roleId;
  }
}

module.exports = AbilityEngine;
