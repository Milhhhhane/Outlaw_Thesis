import type { ReactNode } from 'react';
import credits from '../../../../docs/CREDITS.md?raw';
import { useGame } from '../game/nav';
import { Panel, Screen } from '../game/ui';
import { t } from '../i18n';

/** Texte brut d'une ligne Markdown : liens et code ramenés à leur texte. */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1');
}

/** Rendu minimal de docs/CREDITS.md : titres, listes et paragraphes. */
export function renderCredits(markdown: string): ReactNode[] {
  const out: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = (): void => {
    if (list.length > 0) {
      out.push(
        <ul key={out.length}>
          {list.map((item, i) => (
            <li key={i}>{plain(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
    if (para.length > 0) {
      out.push(<p key={out.length}>{plain(para.join(' '))}</p>);
      para = [];
    }
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('# ')) continue;
    if (line.startsWith('## ')) {
      flush();
      out.push(<h2 key={out.length}>{plain(line.slice(3))}</h2>);
    } else if (line.startsWith('- ')) {
      if (para.length > 0) flush();
      list.push(line.slice(2));
    } else if (line === '') {
      flush();
    } else if (list.length > 0) {
      list[list.length - 1] = `${list.at(-1) ?? ''} ${line}`;
    } else {
      para.push(line);
    }
  }
  flush();
  return out;
}

export function Credits() {
  const { go } = useGame();
  return (
    <Screen
      title={t('credits.title')}
      resources={false}
      onBack={() => {
        go({ name: 'title' });
      }}
    >
      <Panel className="credits">{renderCredits(credits)}</Panel>
    </Screen>
  );
}
