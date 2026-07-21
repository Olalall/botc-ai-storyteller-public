const { getRuntimeScripts, registerRuntimeScript } = require('./ScriptCatalog');

// 剧本管理器
class ScriptManager {
  constructor() {
    this.scripts = new Map();
    this.loadScripts();
  }
  
  // 加载所有剧本
  loadScripts() {
    try {
      for (const script of getRuntimeScripts()) {
        this.scripts.set(script.id, script);
        console.log(`✓ 已加载剧本: ${script.name} (${script.nameEn})`);
      }
    } catch (error) {
      console.error('加载剧本失败:', error);
    }
  }
  
  // 获取剧本列表
  getScriptList() {
    return Array.from(this.scripts.values()).map(script => ({
      id: script.id,
      name: script.name,
      nameEn: script.nameEn,
      difficulty: script.difficulty,
      description: script.description,
      characterCount: this.getCharacterCount(script)
    }));
  }
  
  // 获取指定剧本
  getScript(scriptId) {
    return this.scripts.get(scriptId);
  }

  registerScript(script) {
    const validation = this.validateScript(script);
    if (!validation.valid) {
      const error = new Error(`invalid script: ${validation.errors.join(', ')}`);
      error.validation = validation;
      throw error;
    }
    this.scripts.set(script.id, script);
    registerRuntimeScript(script);
    return script;
  }
  
  // 获取角色数量
  getCharacterCount(script) {
    return {
      townsfolk: script.characters.townsfolk.length,
      outsiders: script.characters.outsiders.length,
      minions: script.characters.minions.length,
      demons: script.characters.demons.length,
      total: script.characters.townsfolk.length + 
             script.characters.outsiders.length + 
             script.characters.minions.length + 
             script.characters.demons.length
    };
  }
  
  // 根据ID查找角色
  findCharacter(scriptId, characterId) {
    const script = this.getScript(scriptId);
    if (!script) return null;
    
    // 在所有类型中查找
    for (const type of ['townsfolk', 'outsiders', 'minions', 'demons']) {
      const character = script.characters[type].find(c => c.id === characterId);
      if (character) {
        return { ...character, type };
      }
    }
    
    return null;
  }
  
  // 获取所有角色（按类型）
  getAllCharacters(scriptId) {
    const script = this.getScript(scriptId);
    if (!script) return null;
    
    return script.characters;
  }
  
  // 验证剧本数据完整性
  validateScript(script) {
    const errors = [];
    
    // 检查必需字段
    if (!script.id) errors.push('缺少剧本ID');
    if (!script.name) errors.push('缺少剧本名称');
    if (!script.characters) errors.push('缺少角色配置');
    if (!script.nightOrder) errors.push('缺少夜间顺序');
    
    // 检查角色配置
    if (script.characters) {
      if (!script.characters.townsfolk || script.characters.townsfolk.length === 0) {
        errors.push('缺少镇民角色');
      }
      if (!script.characters.demons || script.characters.demons.length === 0) {
        errors.push('缺少恶魔角色');
      }
    }
    
    // 检查夜间顺序
    if (script.nightOrder) {
      if (!script.nightOrder.first) errors.push('缺少首夜顺序');
      if (!script.nightOrder.other) errors.push('缺少其他夜晚顺序');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = ScriptManager;
