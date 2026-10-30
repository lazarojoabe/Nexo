import { Icon } from './ui/icon';
import type { QuestionAsset } from '../lib/api';

export function AnswerOption({ label, content, assets, selected, correct, incorrect, disabled, onSelect }: { label: string; content: string; assets: QuestionAsset[]; selected: boolean; correct: boolean; incorrect: boolean; disabled: boolean; onSelect: () => void }) {
  return <button className={`answer-option ${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${incorrect ? 'incorrect' : ''}`} disabled={disabled} onClick={onSelect} aria-pressed={selected}>
    <span className="answer-label">{label}</span><span className="answer-content"><span>{content}</span>{assets.map((asset) => <img key={asset.id} className="answer-asset" src={asset.url} alt={asset.altText} />)}</span>{correct && <Icon name="check" size={19} />}
  </button>;
}
