import { Icon } from './ui/icon';

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state" role="alert"><p>{message}</p>{retry && <button className="text-button" onClick={retry}><Icon name="retry" size={16} /> Tentar novamente</button>}</div>;
}
