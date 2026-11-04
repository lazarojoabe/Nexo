'use client';

import { useState } from 'react';

type AssetImageProps = {
  url: string;
  alt: string;
  className?: string;
};

/** Shows an imported exam image and keeps a direct-open link when the image URL fails. */
export function AssetImage({ url, alt, className }: AssetImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <a className="asset-link-fallback" href={url} target="_blank" rel="noreferrer">Abrir imagem</a>;
  }
  return <img className={className} src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
