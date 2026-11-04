import { Icon } from './ui/icon';
import type { QuestionAsset } from '../lib/api';
import { AssetImage } from './asset-image';

export function AnswerOption({ label, content, assets, selected, correct, incorrect, disabled, onSelect }: { label: string; content: string; assets: QuestionAsset[]; selected: boolean; correct: boolean; incorrect: boolean; disabled: boolean; onSelect: () => void }) {
  return <div className="answer-option-shell"><button className={`answer-option ${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${incorrect ? 'incorrect' : ''}`} disabled={disabled} onClick={onSelect} aria-pressed={selected}>
    <span className="answer-label">{label}</span><span className="answer-content"><span>{content}</span></span>{correct && <Icon name="check" size={19} />}
  </button>{assets.length > 0 && <div className="answer-assets">{assets.map((asset) => <AssetImage key={asset.id} className="answer-asset" url={asset.url} alt={asset.altText} />)}</div>}</div>;
}
