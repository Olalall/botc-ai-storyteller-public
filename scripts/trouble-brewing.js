// 暗流涌动 (Trouble Brewing) 剧本配置
module.exports = {
  id: 'trouble-brewing',
  name: '暗流涌动',
  nameEn: 'Trouble Brewing',
  difficulty: 1,
  description: '入门剧本，信息相对明确，适合新手',
  
  // 角色配置
  characters: {
    // 镇民 (13个)
    townsfolk: [
      {
        id: 'fortune-teller',
        name: '占卜师',
        nameEn: 'Fortune Teller',
        ability: '每夜选择两名玩家，得知其中是否有恶魔',
        abilityType: 'info',
        actionType: 'select_2',
        firstNight: true,
        otherNights: true,
        setup: false,
        reminders: ['红鲱鱼'],
        nightOrder: { first: 39, other: 51 }
      },
      {
        id: 'empath',
        name: '共情者',
        nameEn: 'Empath',
        ability: '每夜得知左右邻座中有多少邪恶玩家（0-2）',
        abilityType: 'info',
        actionType: 'none',
        firstNight: true,
        otherNights: true,
        setup: false,
        reminders: [],
        nightOrder: { first: 37, other: 50 }
      },
      {
        id: 'chef',
        name: '厨师',
        nameEn: 'Chef',
        ability: '首夜得知场上有多少对邻座邪恶玩家（0-2）',
        abilityType: 'info',
        actionType: 'none',
        firstNight: true,
        otherNights: false,
        setup: false,
        reminders: [],
        nightOrder: { first: 36, other: 0 }
      },
      {
        id: 'investigator',
        name: '调查员',
        nameEn: 'Investigator',
        ability: '首夜得知两名玩家和一个爪牙身份，其中一人是该爪牙',
        abilityType: 'info',
        actionType: 'none',
        firstNight: true,
        otherNights: false,
        setup: false,
        reminders: ['爪牙', '错误'],
        nightOrder: { first: 35, other: 0 }
      },
      {
        id: 'librarian',
        name: '图书管理员',
        nameEn: 'Librarian',
        ability: '首夜得知两名玩家和一个外来者身份，其中一人是该外来者',
        abilityType: 'info',
        actionType: 'none',
        firstNight: true,
        otherNights: false,
        setup: false,
        reminders: ['外来者', '错误'],
        nightOrder: { first: 34, other: 0 }
      },
      {
        id: 'monk',
        name: '僧侣',
        nameEn: 'Monk',
        ability: '每夜选择一名玩家（非自己），该玩家本夜不会死亡',
        abilityType: 'protect',
        actionType: 'select_1',
        firstNight: false,
        otherNights: true,
        setup: false,
        reminders: ['保护'],
        nightOrder: { first: 0, other: 12 }
      },
      {
        id: 'ravenkeeper',
        name: '乌鸦守卫',
        nameEn: 'Ravenkeeper',
        ability: '如果你在夜间死亡，你会醒来并得知一名玩家的身份',
        abilityType: 'info',
        actionType: 'select_1',
        firstNight: false,
        otherNights: true,
        setup: false,
        reminders: [],
        nightOrder: { first: 0, other: 43 }
      },
      {
        id: 'slayer',
        name: '杀手',
        nameEn: 'Slayer',
        ability: '白天可公开选择一名玩家，如果是恶魔则其死亡（能力只能使用一次）',
        abilityType: 'kill',
        actionType: 'none',
        firstNight: false,
        otherNights: false,
        setup: false,
        reminders: ['无能力'],
        nightOrder: { first: 0, other: 0 }
      },
      {
        id: 'soldier',
        name: '士兵',
        nameEn: 'Soldier',
        ability: '你免疫恶魔的击杀',
        abilityType: 'protect',
        actionType: 'none',
        firstNight: false,
        otherNights: false,
        setup: false,
        reminders: [],
        nightOrder: { first: 0, other: 0 }
      },
      {
        id: 'mayor',
        name: '市长',
        nameEn: 'Mayor',
        ability: '如果只有3名玩家存活且无处决，好人获胜',
        abilityType: 'modify',
        actionType: 'none',
        firstNight: false,
        otherNights: false,
        setup: false,
        reminders: [],
        nightOrder: { first: 0, other: 0 }
      },
      {
        id: 'washerwoman',
        name: '洗衣妇',
        nameEn: 'Washerwoman',
        ability: '首夜得知两名玩家和一个镇民身份，其中一人是该镇民',
        abilityType: 'info',
        actionType: 'none',
        firstNight: true,
        otherNights: false,
        setup: false,
        reminders: ['镇民', '错误'],
        nightOrder: { first: 33, other: 0 }
      },
      {
        id: 'undertaker',
        name: '守夜人',
        nameEn: 'Undertaker',
        ability: '每夜得知今天被处决的玩家的身份',
        abilityType: 'info',
        actionType: 'none',
        firstNight: false,
        otherNights: true,
        setup: false,
        reminders: ['被处决'],
        nightOrder: { first: 0, other: 44 }
      },
      {
        id: 'virgin',
        name: '处女',
        nameEn: 'Virgin',
        ability: '首次被提名时，如果提名者是镇民，其立即死亡',
        abilityType: 'kill',
        actionType: 'none',
        firstNight: false,
        otherNights: false,
        setup: false,
        reminders: ['无能力'],
        nightOrder: { first: 0, other: 0 }
      }
    ],
    
    // 外来者 (4个)
    outsiders: [
      {
        id: 'butler',
        name: '管家',
        nameEn: 'Butler',
        ability: '首夜选择一名玩家（非自己）作为主人，你只能在主人投票后投票',
        abilityType: 'modify',
        actionType: 'select_1',
        firstNight: true,
        otherNights: false,
        setup: false,
        reminders: ['主人'],
        nightOrder: { first: 38, other: 0 }
      },
      {
        id: 'drunk',
        name: '酒鬼',
        nameEn: 'Drunk',
        ability: '你以为自己是镇民，实际没有特殊能力',
        abilityType: 'modify',
        actionType: 'none',
        firstNight: false,
        otherNights: false,
        setup: true,
        reminders: [],
        nightOrder: { first: 0, other: 0 }
      },
      {
        id: 'recluse',
        name: '隐士',
        nameEn: 'Recluse',
        ability: '你可能被查验为邪恶、爪牙或恶魔',
        abilityType: 'modify',
        actionType: 'none',
        firstNight: false,
        otherNights: false,
        setup: false,
        reminders: [],
        nightOrder: { first: 0, other: 0 }
      },
      {
        id: 'saint',
        name: '圣徒',
        nameEn: 'Saint',
        ability: '如果你被处决，邪恶阵营获胜',
        abilityType: 'modify',
        actionType: 'none',
        firstNight: false,
        otherNights: false,
        setup: false,
        reminders: [],
        nightOrder: { first: 0, other: 0 }
      }
    ],
    
    // 爪牙 (4个)
    minions: [
      {
        id: 'poisoner',
        name: '投毒者',
        nameEn: 'Poisoner',
        ability: '每夜选择一名玩家，该玩家次日中毒（能力失效）',
        abilityType: 'modify',
        actionType: 'select_1',
        firstNight: true,
        otherNights: true,
        setup: false,
        reminders: ['中毒'],
        nightOrder: { first: 17, other: 7 }
      },
      {
        id: 'spy',
        name: '间谍',
        nameEn: 'Spy',
        ability: '每夜看魔典，可能被查验为好人或镇民',
        abilityType: 'info',
        actionType: 'none',
        firstNight: true,
        otherNights: true,
        setup: false,
        reminders: [],
        nightOrder: { first: 49, other: 68 }
      },
      {
        id: 'scarlet-woman',
        name: '猩红女',
        nameEn: 'Scarlet Woman',
        ability: '如果恶魔死亡且存活玩家≥5，你变成恶魔',
        abilityType: 'modify',
        actionType: 'none',
        firstNight: false,
        otherNights: true,
        setup: false,
        reminders: ['恶魔'],
        nightOrder: { first: 0, other: 18 }
      },
      {
        id: 'baron',
        name: '男爵',
        nameEn: 'Baron',
        ability: '设置时增加2个外来者，减少2个镇民',
        abilityType: 'modify',
        actionType: 'none',
        firstNight: false,
        otherNights: false,
        setup: true,
        reminders: [],
        nightOrder: { first: 0, other: 0 }
      }
    ],
    
    // 恶魔 (4个)
    demons: [
      {
        id: 'imp',
        name: '小恶魔',
        nameEn: 'Imp',
        ability: '每夜选择一名玩家杀死。如果你自杀，一名爪牙变成小恶魔',
        abilityType: 'kill',
        actionType: 'select_1',
        firstNight: false,
        otherNights: true,
        setup: false,
        reminders: ['死亡'],
        nightOrder: { first: 0, other: 24 }
      }
    ]
  },
  
  // 夜间行动顺序
  nightOrder: {
    first: [
      'dusk',
      'minion-info',
      'demon-info',
      'poisoner',
      'drunk',
      'washerwoman',
      'librarian',
      'investigator',
      'chef',
      'empath',
      'butler',
      'fortune-teller',
      'spy',
      'dawn'
    ],
    other: [
      'dusk',
      'poisoner',
      'monk',
      'scarlet-woman',
      'imp',
      'ravenkeeper',
      'undertaker',
      'empath',
      'fortune-teller',
      'spy',
      'dawn'
    ]
  },
  
  // 平衡性规则
  balanceRules: {
    // 避免的配置
    avoid: [
      {
        type: 'neighbor',
        role: 'empath',
        neighbor: 'demon',
        reason: '共情者旁边是恶魔会立即暴露'
      }
    ],
    // 推荐的配置
    prefer: [
      {
        type: 'spread',
        roles: ['fortune-teller', 'empath', 'chef', 'investigator', 'librarian', 'washerwoman'],
        reason: '信息类角色应该分散'
      }
    ]
  }
};
