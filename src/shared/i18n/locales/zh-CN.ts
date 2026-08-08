import type { LocaleShape } from '../types';

export const zhCN = {
  assistant: {
    actions: { checkSettings: '检查设置', newConversation: '新建对话', openSettings: '打开 Agent 设置', send: '发送消息', stop: '停止生成' },
    author: { assistant: '写作伙伴', user: '你' },
    composer: { noChapter: '无当前章节', placeholder: '询问 Agent…', setupPlaceholder: '请先配置默认模型' },
    empty: { body: '添加服务商凭据并选择默认模型，Agent 才能处理请求。', loading: '正在读取模型配置', loadingBody: '请稍候。', setup: '连接一个模型后开始写作', setupAction: '打开模型设置', welcome: '我可以阅读当前章节，协助续写、润色或检查设定一致性。生成内容会先供你审阅。' },
    quick: { atmosphere: '增强氛围', atmospherePrompt: '增强当前章节的氛围，但不要改变已发生的情节。', continue: '续写当前章节', continuePrompt: '续写当前章节，保持既有叙事风格。', continuity: '检查一致性', continuityPrompt: '检查当前章节与已知设定是否可能存在矛盾。' },
    status: { cancelling: '正在取消…', loadingConfiguration: '正在读取模型配置…', configurationFailed: '模型配置读取失败', modelUnavailable: '所选模型当前不可用', notConfigured: '尚未配置模型', starting: '正在启动…', streaming: '正在生成…' },
    terminal: { cancelled: '（已取消）', empty: '（模型未返回文本）', failed: '（请求失败）' },
    thinking: { high: '深度', low: '快速', max: '最大', medium: '均衡', minimal: '最低', off: '关闭推理', xhigh: '极高' },
    title: 'Agents',
  },
  common: { actions: { cancel: '取消', close: '关闭', done: '完成', remove: '移除', save: '保存' }, appName: 'Driftfield' },
  editor: {
    actions: { closeFile: '关闭文件', closeNamed: '关闭 {{title}}', more: '更多编辑器操作', save: '保存文件', saveShortcut: '保存（⌘S）' },
    empty: { action: '打开本地项目', hint: '点击小说目录右上角的加号按钮打开本地项目', hintPrefix: '点击小说目录右上角的', title: '没有打开的 Markdown 文档' },
    mdx: { blockType: '段落样式', blockTypeTooltip: '选择段落样式', bold: '粗体', bulletedList: '无序列表', diff: '对比修改', heading: '标题 {{level}}', italic: '斜体', link: '插入链接', numberedList: '有序列表', paragraph: '正文', quote: '引用', redo: '重做 {{shortcut}}', removeBold: '取消粗体', removeItalic: '取消斜体', richText: '所见即所得', source: 'Markdown 源码', undo: '撤销 {{shortcut}}' },
    placeholder: '从这里开始写作……',
    status: { characterCount_one: '{{count}} 字', characterCount_other: '{{count}} 字', dirty: '当前会话修改', missing: '磁盘文件已移动或删除；修改已保留', parseError: '格式解析失败', saving: '正在保存…', plainText: '纯文本', unsavedTitle: '仅保存在当前内存中' },
  },
  errors: {
    agent: { cancelEnded: 'Agent 请求已经结束，无法取消。', cancelFailed: '取消 Agent 请求失败。', configurationLoad: '无法读取 Agent 模型配置。', credentialMissing: '默认模型的服务商凭据已被移除，请重新连接。', credentialRemove: '无法移除 Agent 凭据。', credentialSave: '无法保存凭据或读取模型，请检查 API Key。', modelNotConfigured: '请先连接模型服务并选择默认模型。', requestFailed: 'Agent 请求未能完成，请检查模型配置后重试。', runtimeExited: 'Agent 运行进程意外退出，请重试。', startFailed: '无法启动 Agent 请求。' },
    projects: { dirtySync: '无法同步未保存状态；请先手动保存文档。', open: '无法打开这个文件夹，请重试。', refresh: '项目刷新失败，请检查文件夹后重试。', save: '保存失败，请检查文件权限后重试。' },
    settings: { load: '无法读取应用设置，当前使用默认值。', save: '设置保存失败，请重试。' },
  },
  library: {
    actions: { more: '更多目录操作', open: '打开本地项目', refresh: '刷新项目目录', settings: '应用设置（⌘,）' },
    empty: { action: '打开本地项目', hint: '点击右上角', noMarkdown: '此文件夹中没有 Markdown 文件' },
    labels: { manuscript: '手稿', recovery: '待恢复的未保存文档' },
    missingTitle: '{{path}}（磁盘文件已移动或删除）',
    title: '小说目录',
  },
  main: {
    closeUnsaved: { buttons: { cancel: '取消', discard: '不保存', save: '保存并关闭' }, detail: '如果不保存，你在当前会话中的修改将会丢失。', message: '要保存对“{{title}}”的修改吗？', title: '未保存的修改' },
    openProject: { button: '打开项目', message: '选择一个文件夹作为 Driftfield 项目目录', title: '打开本地项目' },
  },
  projects: {
    conflict: { body: '请选择重新载入磁盘版本、进入对比合并，或确认用当前编辑内容覆盖磁盘版本。', compare: '对比并合并', overwrite: '确认覆盖', reload: '重新载入', title: '文件在磁盘上已更改' },
    errors: { conflictBeforeQuit: '退出已取消，请先处理磁盘文件冲突。', conflictBeforeSwitch: '磁盘文件已被其他程序修改，请先处理冲突。', failedBeforeQuit: '保存未完成，退出已取消。', failedBeforeSwitch: '保存未完成，项目未切换。', missingBeforeQuit: '磁盘文件已移动或删除，退出已取消；请先恢复内容。', missingBeforeSwitch: '有文档的磁盘文件已移动或删除，无法切换项目。请先恢复内容。', saveConflict: '磁盘文件已被其他程序修改，请选择处理方式。', saveMissing: '磁盘文件已被移动或删除；当前修改仍保留在内存中。' },
    messages: { comparisonReady: '已载入磁盘版本作为对比基线，请在编辑器中审阅并合并。' },
    unsavedDocuments_one: '{{count}} 个未保存文档',
    unsavedDocuments_other: '{{count}} 个未保存文档',
    watcher: { refreshFailed: '项目刷新失败；当前内容已保留，请尝试手动刷新。', startFailed: '项目文件监视启动失败；可手动刷新，应用会自动重试。', stopped: '项目文件监视已中断；可手动刷新，应用会自动重连。' },
  },
  settings: {
    agent: { credentialDescription: '凭据仅保存在本机主进程中，应用不会显示已保存的 Key。', keyPlaceholder: '输入 API Key', modelDescription: 'Agent 请求始终使用这里明确选择的模型。', modelLabel: '默认 Agent 模型', modelTitle: '默认模型', noProvider: '尚未连接模型服务', providerTitle: '模型服务', selectModel: '请选择模型', thinkingDescription: '更高等级通常更慢，并可能产生更多费用。', thinkingLabel: 'Agent 思考深度', thinkingTitle: '思考深度' },
    appearance: { description: '应用到窗口、目录、编辑器和 Agent 面板。', title: '外观主题', themes: { githubLight: '明亮、清晰的编辑环境', oneDark: '经典的深灰代码编辑主题', tokyoNight: '低对比度的深蓝夜间主题' } },
    closeBehavior: { description: '明确退出操作始终会完全退出 Driftfield。', label: '关闭主窗口时的行为', minimize: '最小化', quit: '退出应用', title: '关闭主窗口时' },
    description: '调整 Driftfield 的语言、外观和写作体验。更改会自动保存。',
    fontSize: { description: '调整 Markdown 富文本编辑器中的正文字号。', label: '编辑器正文字号', title: '正文大小' },
    language: { description: '更改应用控件和消息，不影响手稿内容。', label: '应用语言', title: '语言' },
    saveStatus: { saved: '设置已自动保存', saving: '正在保存…' },
    title: '应用设置',
  },
  workspace: { collapseAgents: '收起 Agents', collapseLibrary: '收起小说目录', expandAgents: '展开 Agents', expandLibrary: '展开小说目录' },
} satisfies LocaleShape;
