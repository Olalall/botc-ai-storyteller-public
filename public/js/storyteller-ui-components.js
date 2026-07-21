(function attachStorytellerUiComponents(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BOTC_STORYTELLER_UI_COMPONENTS = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createStorytellerUiComponents() {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function resolveCardStateClass(card = {}) {
    const state = card.state || card.tone || '';
    if (state === 'ready') return ' is-ready';
    if (state === 'warning' || state === 'warn') return ' is-warning is-warn';
    if (state === 'blocked') return ' is-blocked';
    return '';
  }

  function renderSummaryCards(cards = [], cardClassName = 'flow-summary-card') {
    return toArray(cards).map((card) => {
      const toneClass = resolveCardStateClass(card);
      return `<div class="${escapeHtml(cardClassName)}${toneClass}"><span>${escapeHtml(card.label || '')}</span><b>${escapeHtml(card.value || '')}</b></div>`;
    }).join('');
  }

  function renderSummaryCardsInto(target, cards = [], cardClassName = 'flow-summary-card') {
    if (!target) return;
    target.innerHTML = renderSummaryCards(cards, cardClassName);
  }

  function renderTokenList(items = [], { emptyText = '暂无记录', itemClassName = 'setup-candidate-token' } = {}) {
    const rows = toArray(items).map((item) => {
      const extraClass = item.className ? ` ${escapeHtml(item.className)}` : '';
      return `
          <div class="${escapeHtml(itemClassName)}${extraClass}">
            <b>${escapeHtml(item.label || '')}</b>
            <span>${escapeHtml(item.value || '')}</span>
          </div>
        `;
    }).join('');
    return `<div class="setup-candidate-token-list">${rows || `<div class="small">${escapeHtml(emptyText)}</div>`}</div>`;
  }

  function renderDetailsSection({ title, count = 0, items = [], emptyText = '暂无记录', open = false } = {}) {
    return `
        <details class="night-section" ${open ? 'open' : ''}>
          <summary><span>${escapeHtml(title || '')}</span><span class="night-section-count">${escapeHtml(count)}</span></summary>
          ${renderTokenList(items, { emptyText })}
        </details>
      `;
  }

  function renderExpandableSection({
    title,
    count = 0,
    bodyHtml = '',
    emptyText = '暂无记录',
    open = false,
    bodyClassName = 'night-resolution-list'
  } = {}) {
    return `
        <details class="night-section" ${open ? 'open' : ''}>
          <summary><span>${escapeHtml(title || '')}</span><span class="night-section-count">${escapeHtml(count)}</span></summary>
          <div class="${escapeHtml(bodyClassName)}">${bodyHtml || `<div class="night-empty">${escapeHtml(emptyText)}</div>`}</div>
        </details>
      `;
  }

  function renderNightResolutionSummaryHtml({
    header = {},
    sections = [],
    sectionBodies = {}
  } = {}) {
    const safeHeader = header || {};
    const sectionRows = toArray(sections).map((section) => {
      const bodySlot = section.bodySlot || section.key;
      return renderExpandableSection({
        title: section.title,
        count: section.count,
        bodyHtml: sectionBodies[bodySlot] || section.bodyHtml || '',
        emptyText: section.emptyText,
        open: section.open === true,
        bodyClassName: section.bodyClassName || 'night-resolution-list'
      });
    }).join('');
    return `
        <div class="night-resolution-header">
          <span>${escapeHtml(safeHeader.phaseTitle || '')}</span>
          <span>${escapeHtml(safeHeader.countText || '')}</span>
        </div>
        <div class="night-flow-step">
          <b>${escapeHtml(safeHeader.nextStepText || '')}</b>
        </div>
        ${sectionRows}
      `;
  }

  function renderLiveLogRows(rows = [], emptyText = '等待操作...') {
    return toArray(rows).map((item) => `
        <div class="state-live-log-item">
          <span class="state-live-log-time">${escapeHtml(item.time || '--:--')}</span>
          <span class="state-live-log-action">${escapeHtml(item.action || '')}</span>
        </div>
      `).join('') || `<div class="state-live-log-item"><span class="state-live-log-time">--:--</span><span class="state-live-log-action">${escapeHtml(emptyText)}</span></div>`;
  }

  function renderNightOrderRowHtml(item = {}) {
    return `
        <div class="night-order-row">
          <span class="night-row-index">${escapeHtml(item.index || '')}</span>
          <span class="night-row-seat">${escapeHtml(item.seat || '')}号</span>
          <span class="night-row-main">
            <span class="night-row-title">${escapeHtml(item.roleName || '')}</span>
            <span class="night-row-detail">${escapeHtml(item.detail || '')}</span>
          </span>
          <span class="night-row-state">${escapeHtml(item.status || '')}</span>
        </div>
      `;
  }

  function renderNightOrderRowsHtml(rows = []) {
    return toArray(rows).map((item) => renderNightOrderRowHtml(item)).join('');
  }

  function renderNightSummaryRowHtml(item = {}) {
    return `
        <details class="night-skill-card">
          <summary>
            <span class="night-row-seat">${escapeHtml(item.seat || '')}号</span>
            <span class="night-row-main">
              <span class="night-row-title">${escapeHtml(item.roleName || '')}</span>
              <span class="night-row-detail">${escapeHtml(item.detail || '')}</span>
            </span>
            <span class="night-row-state">${escapeHtml(item.status || '')}</span>
          </summary>
          <div class="night-skill-body">
            <div class="night-skill-note">${escapeHtml(item.note || '')}</div>
          </div>
        </details>
      `;
  }

  function renderNightSummaryRowsHtml(rows = []) {
    return toArray(rows).map((item) => renderNightSummaryRowHtml(item)).join('');
  }

  function renderRightMenuProgressHtml(progressItems = []) {
    return toArray(progressItems).map((item) => {
      const stateClass = [
        item.done ? 'is-done' : '',
        item.active ? 'is-active' : ''
      ].filter(Boolean).join(' ');
      const className = `menu-flow-progress-step${stateClass ? ` ${stateClass}` : ''}`;
      const stage = item.stage || '';
      const label = item.label || '';
      return `
          <button type="button" class="${className}" data-flow-stage="${escapeHtml(stage)}" data-flow-progress-stage="${escapeHtml(stage)}" title="打开${escapeHtml(label)}面板" aria-label="打开${escapeHtml(label)}面板">
            <i aria-hidden="true"></i>
            <b>${escapeHtml(label)}</b>
          </button>
        `;
    }).join('');
  }

  function renderRightMenuToolButtonsHtml(toolItems = []) {
    return toArray(toolItems).map((item) => {
      const tool = item.tool || '';
      const label = item.label || '';
      const title = item.title || label;
      return `
          <button class="menu-flow-tool" type="button" data-flow-tool="${escapeHtml(tool)}" title="${escapeHtml(title)}">
            ${escapeHtml(label)}
          </button>
        `;
    }).join('');
  }

  function getToolStepStateClass(state = 'ready') {
    const safeState = String(state || 'ready').replace(/[^a-z0-9-]/gi, '');
    return safeState || 'ready';
  }

  function renderToolStepGuideHtml(model = {}) {
    return `
        <div class="tool-step-current">${escapeHtml(model.guidance || '')}</div>
        <div class="tool-step-list">
          ${toArray(model.steps).map((step) => `
            <div class="tool-step-chip is-${escapeHtml(getToolStepStateClass(step.state))}" data-step-key="${escapeHtml(step.key || '')}">
              <span>${escapeHtml(step.label || '')}</span>
              <b>${escapeHtml(step.badge || '')}</b>
              <small>${escapeHtml(step.detail || '')}</small>
            </div>
          `).join('')}
        </div>
      `;
  }

  function renderToolStepGuideInto(target, model = {}) {
    if (!target) return;
    target.innerHTML = renderToolStepGuideHtml(model);
  }

  function renderInputGuideHtml(model = {}) {
    const section = model.section || null;
    return `
        <b>${escapeHtml(model.guidance || '')}</b>
        ${section ? renderDetailsSection(section) : ''}
      `;
  }

  function renderInputGuideInto(target, model = {}) {
    if (!target) return;
    target.innerHTML = renderInputGuideHtml(model);
  }

  function renderDayUtilitySummaryHtml(model = {}, {
    cardClassName = 'day-phase-card',
    noticeText = '公告只展示玩家可见事件；技能提示只提醒说书人复核，不会自动改变权威状态。'
  } = {}) {
    const cardHtml = renderSummaryCards(model.cards || [], cardClassName);
    const sectionsHtml = toArray(model.sections).map((section) => renderDetailsSection(section)).join('');
    return `
        <div class="day-next-step-card"><b>${escapeHtml(model.guidance || '')}</b><span>${escapeHtml(noticeText)}</span></div>
        ${cardHtml ? `<div class="day-phase-cards day-utility-cards">${cardHtml}</div>` : ''}
        ${sectionsHtml}
      `;
  }

  function renderDayUtilitySummaryInto(target, model = {}, options = {}) {
    if (!target) return;
    target.innerHTML = renderDayUtilitySummaryHtml(model, options);
  }

  function applyButtonState(button, { disabled = false, reason = '', title = '', text = null } = {}) {
    if (!button) return;
    const isDisabled = Boolean(disabled);
    button.disabled = isDisabled;
    if (text !== null && text !== undefined) button.textContent = String(text);
    if (isDisabled && reason) {
      button.dataset.disabledReason = String(reason);
      button.title = String(reason);
    } else {
      delete button.dataset.disabledReason;
      button.title = String(title || button.title || '');
    }
  }

  function renderActionReasonHtml(title = '', detail = '') {
    return `<b>${escapeHtml(title || '')}</b><span>${escapeHtml(detail || '')}</span>`;
  }

  function renderActionReasonInto(target, title = '', detail = '') {
    if (!target) return;
    target.innerHTML = renderActionReasonHtml(title, detail);
  }

  function renderNightCandidateReviewGuide(guide = {}) {
    const items = toArray(guide.items);
    const tone = String(guide.tone || '').replace(/[^a-z0-9-]/gi, '');
    const toneClass = tone ? ` is-${tone}` : '';
    const title = guide.title || '裁决前检查';
    const detail = guide.detail || '确认前不写入权威结果；如信息或状态不应生效，请点“拒绝”。';
    return `
        <div class="night-candidate-review-guide${toneClass}">
          <div class="night-candidate-review-title">
            <span>${escapeHtml(title)}</span>
            <small>${escapeHtml(detail)}</small>
          </div>
          ${items.length ? `
            <div class="night-candidate-review-items">
              ${items.map((item) => `
                <div class="night-candidate-review-item">
                  <span>${escapeHtml(item.label || '')}</span>
                  <b>${escapeHtml(item.value || '')}</b>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
  }

  function renderNightCandidateEditorShellHtml({
    id = '',
    title = '',
    badge = '',
    subtitle = '',
    sectionsHtml = '',
    visibleSectionHtml = '',
    stateSectionHtml = ''
  } = {}) {
    const bodyHtml = sectionsHtml || `${visibleSectionHtml || ''}${stateSectionHtml || ''}`;
    return `
        <div class="night-candidate-editor" data-candidate-editor="${escapeHtml(id)}">
          <div class="night-candidate-editor-title">
            <span>${escapeHtml(title || '')}</span>
            <span>${escapeHtml(badge || '')}</span>
          </div>
          <div class="night-candidate-editor-subtitle">${escapeHtml(subtitle || '')}</div>
          ${bodyHtml}
        </div>
      `;
  }

  function renderNightCandidateEditorSectionHtml({
    section = '',
    title = '',
    primaryHtml = '',
    secondaryHtml = ''
  } = {}) {
    return `
        <section class="night-candidate-editor-section" data-editor-section="${escapeHtml(section || '')}">
          <b>${escapeHtml(title || '')}</b>
          ${primaryHtml ? `<div class="night-candidate-editor-grid is-primary">${primaryHtml}</div>` : ''}
          ${secondaryHtml ? `<div class="night-candidate-editor-grid">${secondaryHtml}</div>` : ''}
        </section>
      `;
  }

  function renderNightCandidateEditorFieldHtml({
    label = '',
    bodyHtml = '',
    className = '',
    hint = ''
  } = {}) {
    const classAttr = className ? ` class="${escapeHtml(className)}"` : '';
    return `
        <label${classAttr}>
          <span>${escapeHtml(label || '')}</span>
          ${bodyHtml || ''}
          ${hint ? `<small class="night-candidate-editor-hint">${escapeHtml(hint)}</small>` : ''}
        </label>
      `;
  }

  function renderHtmlAttributes(attributes = {}) {
    return Object.entries(attributes || {}).map(([name, value]) => {
      const safeName = String(name || '').replace(/[^a-z0-9_:-]/gi, '');
      if (!safeName || value === false || value === null || value === undefined) return '';
      if (value === true) return safeName;
      return `${safeName}="${escapeHtml(value)}"`;
    }).filter(Boolean).join(' ');
  }

  function renderNightCandidateEditorOptionsHtml(options = []) {
    return toArray(options).map((option) => (
      `<option value="${escapeHtml(option.value || '')}" ${option.selected ? 'selected' : ''}>${escapeHtml(option.label || '')}</option>`
    )).join('');
  }

  function renderNightCandidateEditorControlAttrs({
    editKey = '',
    disabled = false,
    attributes = {}
  } = {}) {
    return renderHtmlAttributes({
      ...(editKey ? { 'data-candidate-edit': editKey } : {}),
      ...attributes,
      disabled: Boolean(disabled)
    });
  }

  function renderNightCandidateEditorTextareaHtml({
    editKey = '',
    value = '',
    disabled = false,
    attributes = {}
  } = {}) {
    const attrs = renderNightCandidateEditorControlAttrs({ editKey, disabled, attributes });
    return `<textarea ${attrs}>${escapeHtml(value || '')}</textarea>`;
  }

  function renderNightCandidateEditorInputHtml({
    editKey = '',
    type = '',
    value = '',
    disabled = false,
    attributes = {}
  } = {}) {
    const attrs = renderNightCandidateEditorControlAttrs({
      editKey,
      disabled,
      attributes: {
        ...(type ? { type } : {}),
        ...attributes,
        value
      }
    });
    return `<input ${attrs}>`;
  }

  function renderNightCandidateEditorSelectHtml({
    editKey = '',
    options = [],
    optionsHtml = '',
    disabled = false,
    attributes = {}
  } = {}) {
    const attrs = renderNightCandidateEditorControlAttrs({ editKey, disabled, attributes });
    return `<select ${attrs}>${optionsHtml || renderNightCandidateEditorOptionsHtml(options)}</select>`;
  }

  function renderNightCandidateEditorControlHtml(control = {}, {
    renderRoleOptionsHtml = null
  } = {}) {
    if (control.kind === 'textarea') {
      return renderNightCandidateEditorTextareaHtml({
        editKey: control.editKey,
        value: control.value,
        disabled: control.disabled,
        attributes: control.attributes
      });
    }
    if (control.kind === 'input') {
      return renderNightCandidateEditorInputHtml({
        editKey: control.editKey,
        type: control.inputType,
        value: control.value,
        disabled: control.disabled,
        attributes: control.attributes
      });
    }
    if (control.kind === 'select') {
      return renderNightCandidateEditorSelectHtml({
        editKey: control.editKey,
        options: control.options,
        optionsHtml: control.optionsHtml,
        disabled: control.disabled,
        attributes: control.attributes
      });
    }
    if (control.kind === 'role-select') {
      const selectedRoleId = control.selectedRoleId || control.value || '';
      const roleOptionsHtml = typeof renderRoleOptionsHtml === 'function'
        ? renderRoleOptionsHtml(selectedRoleId)
        : '';
      return renderNightCandidateEditorSelectHtml({
        editKey: control.editKey,
        options: control.options,
        optionsHtml: control.optionsHtml || roleOptionsHtml,
        disabled: control.disabled,
        attributes: control.attributes
      });
    }
    return '';
  }

  function renderNightCandidateEditorFieldListHtml(fields = [], options = {}) {
    return toArray(fields).map((field) => renderNightCandidateEditorFieldHtml({
      label: field.label,
      className: field.className,
      hint: field.hint,
      bodyHtml: renderNightCandidateEditorControlHtml(field.control || {}, options)
    })).join('');
  }

  function renderNightCandidateEditorSectionsHtml(sections = [], options = {}) {
    return toArray(sections).map((section) => renderNightCandidateEditorSectionHtml({
      section: section.section,
      title: section.title,
      primaryHtml: renderNightCandidateEditorFieldListHtml(section.primaryFields, options),
      secondaryHtml: renderNightCandidateEditorFieldListHtml(section.secondaryFields, options)
    })).join('');
  }

  function renderNightCandidateEditorModelHtml(model = {}, options = {}) {
    const safeModel = model || {};
    return renderNightCandidateEditorShellHtml({
      id: safeModel.id,
      title: safeModel.title,
      badge: safeModel.badge,
      subtitle: safeModel.subtitle,
      sectionsHtml: renderNightCandidateEditorSectionsHtml(safeModel.sections, options)
    });
  }

  function renderNightCandidateEditorHtml(model = {}, options = {}) {
    return renderNightCandidateEditorModelHtml(model, options);
  }

  function renderNightCandidateActionAttrs(action = {}) {
    const title = action.title || action.reason || '';
    return renderHtmlAttributes({
      disabled: Boolean(action.disabled),
      ...(title ? { title } : {}),
      ...(action.reason ? { 'data-disabled-reason': action.reason } : {})
    });
  }

  function renderNightCandidateActionsHtml({
    id = '',
    actions = {},
    reviewable = false
  } = {}) {
    const confirm = actions.confirm || { text: '确认', disabled: !reviewable };
    const edit = actions.edit || { text: '修改结果', disabled: !reviewable };
    const reject = actions.reject || { text: '\u4e0d\u91c7\u7528', disabled: !reviewable };
    const recordOnly = actions.recordOnly || { text: '仅记录', disabled: !reviewable };
    const confirmAttrs = renderNightCandidateActionAttrs(confirm);
    const editAttrs = renderNightCandidateActionAttrs(edit);
    const rejectAttrs = renderNightCandidateActionAttrs(reject);
    const recordOnlyAttrs = renderNightCandidateActionAttrs(recordOnly);
    return `
        <div class="night-candidate-actions">
          <button class="layout-control-button" type="button" data-confirm-candidate="${escapeHtml(id)}" ${confirmAttrs}>${escapeHtml(confirm.text || '确认')}</button>
          <button class="layout-control-button is-secondary" type="button" data-edit-candidate="${escapeHtml(id)}" ${editAttrs}>${escapeHtml(edit.text || '修改结果')}</button>
          <button class="layout-control-button is-secondary" type="button" data-record-candidate="${escapeHtml(id)}" ${recordOnlyAttrs}>${escapeHtml(recordOnly.text || '仅记录')}</button>
          <button class="layout-control-button is-danger" type="button" data-reject-candidate="${escapeHtml(id)}" ${rejectAttrs}>${escapeHtml(reject.text || '\u4e0d\u91c7\u7528')}</button>
        </div>
      `;
  }

  function renderNightCandidateCardHtml(model = {}, {
    reviewGuideHtml = '',
    editorHtml = ''
  } = {}) {
    const id = model.id || '';
    const reviewable = model.reviewable === true;
    const metaRows = toArray(model.metaItems).map((item) => `<span>${escapeHtml(item)}</span>`).join('');
    const warningRows = toArray(model.warnings).map((item) => `<div class="night-warning-item">${escapeHtml(item)}</div>`).join('');
    const guideHtml = model.hideReviewGuide ? '' : (reviewGuideHtml || (model.reviewGuide ? renderNightCandidateReviewGuide(model.reviewGuide) : ''));
    return `
        <details class="night-skill-card night-candidate-card${model.isEditing ? ' is-editing' : ''}" data-candidate-id="${escapeHtml(id)}" ${reviewable ? 'open' : ''}>
          <summary>
            <span class="night-row-seat">${escapeHtml(model.seat || '')}号</span>
            <span class="night-row-main">
              <span class="night-row-title">${escapeHtml(model.roleName || '')}</span>
              <span class="night-row-detail">${escapeHtml(model.headline || '')}</span>
            </span>
            <span class="night-row-state">${escapeHtml(model.statusLabel || '')}</span>
          </summary>
          <div class="night-skill-body">
            ${renderNightCandidateActionsHtml({ id, actions: model.actions || {}, reviewable })}
            ${guideHtml}
            <div class="night-candidate-effect">
              <b>${escapeHtml(model.effectTitle || '裁决效果')}</b>
              <span>${escapeHtml(model.detailCore || '')}</span>
            </div>
            ${!model.hideMeta && metaRows ? `<div class="night-candidate-meta">${metaRows}</div>` : ''}
            ${warningRows ? `<div class="night-warning-list">${warningRows}</div>` : ''}
            ${editorHtml || ''}
          </div>
        </details>
      `;
  }

  function renderNightCandidateRowsHtml(rows = []) {
    return toArray(rows).map((row) => {
      const model = row.model || row;
      const reviewable = model.reviewable === true;
      return renderNightCandidateCardHtml({
        ...model,
        actions: model.actions || {
          confirm: { text: '确认', disabled: !reviewable },
          reject: { text: '\u4e0d\u91c7\u7528', disabled: !reviewable }
        }
      }, {
        reviewGuideHtml: row.reviewGuideHtml || model.reviewGuideHtml || '',
        editorHtml: row.editorHtml || model.editorHtml || ''
      });
    }).join('');
  }

  function bindNightCandidateActionHandlers(root, {
    onConfirm,
    onEdit,
    onReject,
    onRecordOnly
  } = {}) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return { confirmCount: 0, editCount: 0, rejectCount: 0, recordOnlyCount: 0 };
    }
    const confirmButtons = Array.from(root.querySelectorAll('[data-confirm-candidate]') || []);
    const editButtons = Array.from(root.querySelectorAll('[data-edit-candidate]') || []);
    const rejectButtons = Array.from(root.querySelectorAll('[data-reject-candidate]') || []);
    const recordOnlyButtons = Array.from(root.querySelectorAll('[data-record-candidate]') || []);
    const invokeAction = (button, action, id) => {
      if (!button || button.disabled || !id) return;
      const handler = action === 'confirm' ? onConfirm : action === 'record-only' ? onRecordOnly : onReject;
      if (typeof handler !== 'function') return;
      button.dataset.originalText = button.dataset.originalText || button.textContent || '';
      button.classList?.add?.('is-processing');
      button.setAttribute?.('aria-busy', 'true');
      button.disabled = true;
      if ('textContent' in button) button.textContent = '处理中...';
      const restore = () => {
        if (!button.isConnected && button.isConnected !== undefined) return;
        if (button.getAttribute && button.getAttribute('aria-busy') !== 'true') return;
        button.classList?.remove?.('is-processing');
        button.removeAttribute?.('aria-busy');
        button.disabled = false;
        if ('textContent' in button) button.textContent = button.dataset.originalText || (action === 'confirm' ? '确认' : action === 'record-only' ? '仅记录' : '拒绝');
      };
      const setTimer = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
        ? window.setTimeout.bind(window)
        : setTimeout;
      setTimer(restore, 12000);
      try {
        const result = handler(id);
        if (result && typeof result.catch === 'function') {
          result
            .catch((error) => {
              console.error('night candidate action failed', error);
            })
            .finally(restore);
        } else {
          restore();
        }
      } catch (error) {
        console.error('night candidate action failed', error);
        restore();
      }
    };
    if (typeof root.addEventListener === 'function') {
      root.__botcNightCandidateHandlers = { onConfirm, onEdit, onReject, onRecordOnly, invokeAction };
      if (root.dataset) root.dataset.nightCandidateActionsBound = root.dataset.nightCandidateActionsBound || '0';
      if (!root.__botcNightCandidateActionsBound) {
        root.addEventListener('click', (event) => {
          const button = event.target?.closest?.('[data-confirm-candidate],[data-edit-candidate],[data-record-candidate],[data-reject-candidate]');
          if (!button || !root.contains(button)) return;
          event.preventDefault();
          event.stopPropagation();
          const handlers = root.__botcNightCandidateHandlers || {};
          const isConfirm = button.hasAttribute('data-confirm-candidate');
          const isEdit = button.hasAttribute('data-edit-candidate');
          const isRecordOnly = button.hasAttribute('data-record-candidate');
          const id = isConfirm
            ? button.dataset.confirmCandidate
            : isEdit
              ? button.dataset.editCandidate
              : isRecordOnly ? button.dataset.recordCandidate : button.dataset.rejectCandidate;
          if (isEdit) {
            handlers.onEdit?.(id);
            return;
          }
          handlers.invokeAction?.(button, isConfirm ? 'confirm' : isRecordOnly ? 'record-only' : 'reject', id);
        }, true);
        root.__botcNightCandidateActionsBound = true;
        if (root.dataset) root.dataset.nightCandidateActionsBound = '1';
      }
    } else {
      confirmButtons.forEach((button) => {
        button.addEventListener('click', () => invokeAction(button, 'confirm', button.dataset.confirmCandidate));
      });
      editButtons.forEach((button) => {
        button.addEventListener('click', () => onEdit?.(button.dataset.editCandidate));
      });
      rejectButtons.forEach((button) => {
        button.addEventListener('click', () => invokeAction(button, 'reject', button.dataset.rejectCandidate));
      });
      recordOnlyButtons.forEach((button) => {
        button.addEventListener('click', () => invokeAction(button, 'record-only', button.dataset.recordCandidate));
      });
    }
    return {
      confirmCount: confirmButtons.length,
      editCount: editButtons.length,
      rejectCount: rejectButtons.length,
      recordOnlyCount: recordOnlyButtons.length
    };
  }

  return {
    escapeHtml,
    resolveCardStateClass,
    renderSummaryCards,
    renderSummaryCardsInto,
    renderTokenList,
    renderDetailsSection,
    renderExpandableSection,
    renderNightResolutionSummaryHtml,
    renderLiveLogRows,
    renderNightOrderRowHtml,
    renderNightOrderRowsHtml,
    renderNightSummaryRowHtml,
    renderNightSummaryRowsHtml,
    renderRightMenuProgressHtml,
    renderRightMenuToolButtonsHtml,
    renderToolStepGuideHtml,
    renderToolStepGuideInto,
    renderInputGuideHtml,
    renderInputGuideInto,
    renderDayUtilitySummaryHtml,
    renderDayUtilitySummaryInto,
    applyButtonState,
    renderActionReasonHtml,
    renderActionReasonInto,
    renderNightCandidateReviewGuide,
    renderNightCandidateEditorShellHtml,
    renderNightCandidateEditorSectionHtml,
    renderNightCandidateEditorFieldHtml,
    renderNightCandidateEditorOptionsHtml,
    renderNightCandidateEditorTextareaHtml,
    renderNightCandidateEditorInputHtml,
    renderNightCandidateEditorSelectHtml,
    renderNightCandidateEditorControlHtml,
    renderNightCandidateEditorFieldListHtml,
    renderNightCandidateEditorSectionsHtml,
    renderNightCandidateEditorModelHtml,
    renderNightCandidateEditorHtml,
    renderNightCandidateActionAttrs,
    renderNightCandidateActionsHtml,
    renderNightCandidateCardHtml,
    renderNightCandidateRowsHtml,
    bindNightCandidateActionHandlers
  };
});
