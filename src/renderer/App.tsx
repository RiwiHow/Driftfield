const chapters = ['序章：风从荒原来', '第一章：失落的信标', '第二章：无名旅人'];

export function App() {
  const { platform, versions } = window.driftfield;

  return (
    <main className="app-shell">
      <aside className="library-panel">
        <div className="brand">
          <span className="brand-mark">D</span>
          <div>
            <strong>Driftfield</strong>
            <span>AI 小说工作台</span>
          </div>
        </div>

        <button className="new-project" type="button">
          ＋ 新建作品
        </button>

        <section className="project-block">
          <p className="eyebrow">当前作品</p>
          <h2>漂流地</h2>
          <p className="project-meta">长篇 · 3 个章节</p>
        </section>

        <nav className="chapter-list" aria-label="章节列表">
          {chapters.map((chapter, index) => (
            <button
              className={index === 0 ? 'chapter active' : 'chapter'}
              key={chapter}
              type="button"
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              {chapter}
            </button>
          ))}
        </nav>

        <div className="runtime-badge">
          Electron {versions.electron} · {platform}
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">正文编辑</p>
            <h1>序章：风从荒原来</h1>
          </div>
          <div className="header-actions">
            <span className="saved-state">已保存</span>
            <button className="secondary-action" type="button">
              导出
            </button>
          </div>
        </header>

        <div className="editor-layout">
          <article className="editor-card">
            <textarea
              aria-label="小说正文"
              defaultValue={
                '风越过无人耕种的荒原时，旧信标第一次亮了起来。\n\n林舟停下脚步。他已经很多年没有见过那种颜色——不是篝火的橙，也不是城市终夜不熄的白，而是一点沉静、遥远的蓝。\n\n它像是在等一个迟到了很久的人。'
              }
              spellCheck={false}
            />
            <footer>
              <span>87 字</span>
              <span>本地草稿</span>
            </footer>
          </article>

          <aside className="assistant-panel">
            <div>
              <p className="eyebrow">AI 助手</p>
              <h2>接下来写什么？</h2>
              <p className="assistant-copy">
                选择一项写作动作。模型接入后，生成内容会先进入预览，不会直接覆盖正文。
              </p>
            </div>

            <div className="prompt-actions">
              <button type="button">续写这一段</button>
              <button type="button">增强氛围</button>
              <button type="button">检查人物一致性</button>
            </div>

            <button className="primary-action" disabled type="button">
              尚未配置模型
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}

