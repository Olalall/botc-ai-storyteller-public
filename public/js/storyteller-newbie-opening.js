(function attachStorytellerNewbieOpening(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BOTC_STORYTELLER_NEWBIE_OPENING = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => api.init());
    } else {
      api.init();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function createStorytellerNewbieOpening() {
  const OPENING_SECTIONS = Object.freeze([
    {
      title: '1. 欢迎与定调',
      paragraphs: [
        '欢迎大家来到《血染钟楼》！今晚，我们齐聚在这个看似平静的小镇，但危机已经悄然降临——我们当中，隐藏着恶魔。',
        '作为说书人，我不是你们的对手，我是这场游戏的导演和裁判。我的唯一目标是让大家都玩得开心。所以，不用担心记不住规则，闭眼时我会全程引导你们，遇到任何疑问，随时可以闭眼找我私聊。'
      ]
    },
    {
      title: '2. 核心规则',
      paragraphs: [
        '两大阵营：游戏分为好人阵营（村民和外来人）和坏人阵营（爪牙和恶魔）。',
        '胜负条件：好人赢很简单，找出并处决恶魔；坏人赢也很简单，杀到场上只剩下2个人。',
        '白昼与黑夜：黑夜大家闭眼，我会一个个叫醒特定角色起来发动技能。白天大家睁眼，我会宣布昨晚谁死了，接着是自由讨论、私聊和投票处决时间。'
      ]
    },
    {
      title: '3. 三大新手黄金法则',
      paragraphs: [
        '死亡不是终点：在这个游戏里，死人是非常重要的！死人不会出局，不需要离席，依然可以正常发言、帮好人盘逻辑。而且，死人在接下来的游戏里还有最后一次投票权。所以，不要怕死，有时候好人慷慨就义反而能帮团队洗清嫌疑。',
        '信息可能有毒：如果你拿到了好人牌，你得到的信息不一定是真的。因为游戏中存在醉酒或中毒的状态。如果你发现自己的信息和别人对不上，别急着断定对方是坏人，你可能只是喝高了，这也是游戏好玩的地方。',
        '坏人要大胆穿衣服：如果你不幸拿到了坏人牌，别慌。我会给恶魔提供3个场上没有的角色作为伪装。大胆地把这些身份报给别人，只要你编得自信，大家就会信你！'
      ]
    },
    {
      title: '4. 发言守则与钟楼礼仪',
      paragraphs: [
        '最后，我们要强调几个《血染钟楼》的发言礼仪。这个游戏玩的是逻辑、演技和心理博弈，所以我们要杜绝以下几种发言：',
        '严禁发誓贴脸：请不要说“我发誓我拿的是好人，骗人我是xx”、或者“我用人格担保、赌一杯奶茶我没撒谎”。这就属于贴脸发言，不仅破坏游戏平衡，还会让大家很难勘验逻辑。',
        '严禁聊场外：比如“我刚才听到我旁边的人衣服有摩擦声，他肯定是恶魔”，或者“说书人刚才在那个方向停了很久”。我们只盘游戏内的逻辑，不盘游戏外的动静。',
        '请勿情绪输出：如果被踩了、或者被怀疑了，千万别生气。坏人撒谎是他们的职责，好人怀疑一切是他们的本分。大家都是戏精，出了这个门，我们还是好朋友！'
      ]
    },
    {
      title: '5. 游戏正式开始',
      paragraphs: [
        '等会儿大家闭眼，我会拍肩膀叫醒部分人。我会用手势问你问题，或者用手势给你信息，全程我们不说话，用手势交流。做完动作就继续闭眼。',
        '好，现在天黑请闭眼，请大家双手交叉放在胸前，游戏正式开始……'
      ]
    }
  ]);

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildOpeningHtml(sections = OPENING_SECTIONS) {
    return sections.map((section) => `
      <section class="newbie-opening-section">
        <h3>${escapeHtml(section.title)}</h3>
        ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
      </section>
    `).join('');
  }

  function ensureStyles() {
    if (document.getElementById('newbie-opening-style')) return;
    const style = document.createElement('style');
    style.id = 'newbie-opening-style';
    style.textContent = `
      .newbie-opening-card {
        pointer-events: auto;
        margin-top: 8px;
        padding: 8px;
        border: 1px solid rgba(169, 119, 54, 0.52);
        border-radius: 10px;
        background: linear-gradient(180deg, rgba(34, 19, 9, 0.88), rgba(7, 5, 4, 0.92));
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255,255,255,0.04);
      }
      .newbie-opening-button {
        width: 100%;
        min-height: 34px;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 8px;
        align-items: center;
        padding: 7px 9px;
        border: 1px solid rgba(229, 186, 108, 0.38);
        border-radius: 9px;
        background: rgba(0, 0, 0, 0.34);
        color: #ffe8b4;
        font-size: 12px;
        font-weight: 900;
        text-align: left;
        text-shadow: 0 2px 3px #000;
      }
      .newbie-opening-button:hover {
        border-color: rgba(255, 223, 158, 0.72);
        background: rgba(72, 43, 18, 0.62);
      }
      .newbie-opening-button:focus-visible {
        outline: 2px solid rgba(246, 204, 120, 0.9);
        outline-offset: 2px;
      }
      .newbie-opening-button-icon {
        width: 23px;
        height: 23px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        border: 1px solid rgba(229, 186, 108, 0.38);
        background: rgba(0, 0, 0, 0.36);
        color: #f4cf73;
        font-size: 15px;
      }
      .newbie-opening-button-copy {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .newbie-opening-button-copy b {
        font-size: 12px;
        line-height: 1.12;
      }
      .newbie-opening-button-copy span {
        color: rgba(246, 224, 183, 0.74);
        font-size: 10.5px;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .newbie-opening-overlay {
        position: fixed;
        z-index: 140;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 28px;
        background: rgba(0, 0, 0, 0.72);
        backdrop-filter: blur(2px);
      }
      .newbie-opening-overlay.open {
        display: flex;
      }
      .newbie-opening-modal {
        width: min(900px, calc(100vw - 42px));
        max-height: min(840px, calc(100vh - 48px));
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        border: 1px solid rgba(226, 183, 102, 0.58);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(43, 24, 12, 0.98), rgba(8, 5, 4, 0.98)),
          rgba(0, 0, 0, 0.92);
        color: #f8e8c4;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.74), inset 0 1px 0 rgba(255,255,255,0.06);
        overflow: hidden;
      }
      .newbie-opening-header {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        align-items: start;
        padding: 18px 20px 14px;
        border-bottom: 1px solid rgba(229, 186, 108, 0.2);
        text-align: left;
      }
      .newbie-opening-header h2 {
        margin: 0;
        color: #ffe7ae;
        font-size: clamp(24px, 2.2vw, 34px);
        text-align: left;
        text-shadow: 0 2px 4px #000;
      }
      .newbie-opening-header p {
        margin: 5px 0 0;
        color: rgba(246, 224, 183, 0.78);
        font-size: 13px;
        line-height: 1.45;
      }
      .newbie-opening-close {
        width: 40px;
        height: 40px;
        border: 1px solid rgba(229, 186, 108, 0.42);
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.36);
        color: #ffe0a4;
        font-size: 24px;
        line-height: 1;
      }
      .newbie-opening-body {
        overflow: auto;
        padding: 16px 20px 18px;
      }
      .newbie-opening-section {
        padding: 13px 14px;
        border: 1px solid rgba(229, 186, 108, 0.18);
        border-radius: 13px;
        background: rgba(0, 0, 0, 0.18);
      }
      .newbie-opening-section + .newbie-opening-section {
        margin-top: 12px;
      }
      .newbie-opening-section h3 {
        margin: 0 0 8px;
        color: #f6cf78;
        font-family: "Microsoft YaHei", "Noto Serif SC", "SimSun", sans-serif;
        font-size: 16px;
        font-weight: 900;
        text-align: left;
      }
      .newbie-opening-section p {
        margin: 7px 0 0;
        color: rgba(255, 239, 205, 0.92);
        font-size: 14px;
        line-height: 1.68;
      }
      .newbie-opening-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 12px 20px 16px;
        border-top: 1px solid rgba(229, 186, 108, 0.16);
      }
      .newbie-opening-footer button {
        min-width: 132px;
        min-height: 38px;
        padding: 8px 16px;
        border: 1px solid rgba(229, 186, 108, 0.44);
        border-radius: 9px;
        background: linear-gradient(180deg, rgba(129, 82, 32, 0.94), rgba(42, 24, 12, 0.96));
        color: #fff1cc;
        font-weight: 900;
      }
      @media (max-width: 1180px), (max-height: 720px) {
        .newbie-opening-card {
          display: none;
        }
      }
      @media (max-width: 720px) {
        .newbie-opening-overlay {
          padding: 14px;
        }
        .newbie-opening-modal {
          width: calc(100vw - 24px);
          max-height: calc(100vh - 24px);
          border-radius: 14px;
        }
        .newbie-opening-header {
          padding: 15px 15px 12px;
        }
        .newbie-opening-body {
          padding: 12px 14px 14px;
        }
        .newbie-opening-section p {
          font-size: 13px;
          line-height: 1.62;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    let overlay = document.getElementById('newbie-opening-modal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'newbie-opening-modal';
    overlay.className = 'newbie-opening-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <article class="newbie-opening-modal" role="dialog" aria-modal="true" aria-labelledby="newbie-opening-title" aria-describedby="newbie-opening-subtitle">
        <header class="newbie-opening-header">
          <div>
            <h2 id="newbie-opening-title">新手开场白</h2>
            <p id="newbie-opening-subtitle">开局前可照读；主流程不变，读完关闭即可继续发身份或开始首夜。</p>
          </div>
          <button class="newbie-opening-close" type="button" aria-label="关闭新手开场白">×</button>
        </header>
        <div class="newbie-opening-body">${buildOpeningHtml()}</div>
        <footer class="newbie-opening-footer">
          <button type="button" data-newbie-opening-close>关闭</button>
        </footer>
      </article>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-newbie-opening-close], .newbie-opening-close')) {
        closeOpening();
      }
    });
    return overlay;
  }

  function ensureLauncher() {
    const panel = document.getElementById('main-flow-panel');
    if (!panel || document.getElementById('newbie-opening-launcher')) return;
    const card = document.createElement('section');
    card.id = 'newbie-opening-launcher';
    card.className = 'newbie-opening-card';
    card.setAttribute('aria-label', '新手开场白入口');
    card.innerHTML = `
      <button class="newbie-opening-button" type="button" aria-haspopup="dialog" aria-controls="newbie-opening-modal">
        <span class="newbie-opening-button-icon" aria-hidden="true">朗</span>
        <span class="newbie-opening-button-copy">
          <b>新手开场白</b>
          <span>开局前照读，点击展开完整稿。</span>
        </span>
      </button>
    `;
    panel.appendChild(card);
    card.querySelector('button')?.addEventListener('click', openOpening);
  }

  function openOpening() {
    const overlay = ensureModal();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.querySelector('.newbie-opening-close')?.focus();
  }

  function closeOpening() {
    const overlay = document.getElementById('newbie-opening-modal');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.querySelector('#newbie-opening-launcher button')?.focus();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && document.getElementById('newbie-opening-modal')?.classList.contains('open')) {
      closeOpening();
    }
  }

  function init() {
    ensureStyles();
    ensureModal();
    ensureLauncher();
    if (!document.documentElement.dataset.newbieOpeningEscBound) {
      document.addEventListener('keydown', handleKeydown);
      document.documentElement.dataset.newbieOpeningEscBound = '1';
    }
  }

  return {
    OPENING_SECTIONS,
    buildOpeningHtml,
    init,
    openOpening,
    closeOpening
  };
});
