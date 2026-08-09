import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SafeMarkdown } from '../../../../src/renderer/features/assistant/SafeMarkdown';

const render = (markdown: string): string =>
  renderToStaticMarkup(<SafeMarkdown>{markdown}</SafeMarkdown>);

describe('SafeMarkdown', () => {
  it('renders common review-friendly Markdown', () => {
    const html = render('## Review\n\n- **Keep** this\n- `revise` that');

    expect(html).toContain('<h2>Review</h2>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<strong>Keep</strong>');
    expect(html).toContain('<code>revise</code>');
  });

  it('does not interpret raw HTML', () => {
    const html = render('Before <script>alert(1)</script><b>unsafe</b> after');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>');
    expect(html).toContain('alert(1)unsafe');
  });

  it('does not create navigable links or load images', () => {
    const html = render(
      '[external](https://example.com) ![remote image](https://example.com/a.png)',
    );

    expect(html).not.toContain('<a');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('src=');
    expect(html).toContain('external');
    expect(html).toContain('remote image');
  });

  it('wraps tables in a keyboard-scrollable container', () => {
    const html = render('| Chapter | Title |\n| --- | --- |\n| 1 | Home |');

    expect(html).toContain(
      '<div class="agent-markdown-table" tabindex="0"><table>',
    );
    expect(html).toContain('<th>Chapter</th>');
    expect(html).toContain('<td>Home</td>');
  });

  it('forces task-list checkboxes to remain read-only', () => {
    const html = render('- [x] Reviewed\n- [ ] Pending');

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('readOnly=""');
    expect(html).toContain('tabindex="-1"');
  });
});
