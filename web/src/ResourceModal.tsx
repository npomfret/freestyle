import { useEffect } from 'react';
import type { Resource } from './types';

interface ResourceModalProps {
    resource: Resource;
    related: Resource[];
    onClose: () => void;
}

export default function ResourceModal({ resource, related, onClose }: ResourceModalProps) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div className='modal-backdrop' onClick={onClose}>
            <div className='modal' onClick={(e) => e.stopPropagation()}>
                <button className='modal-close' onClick={onClose} aria-label='Close'>✕</button>

                <div className='modal-header'>
                    <h2 className='modal-title'>
                        <a href={resource.url} target='_blank' rel='noopener noreferrer'>{resource.name}</a>
                    </h2>
                    <div className='modal-tags'>
                        {resource.kinds.map((k) => (
                            <span key={k} className={`tag kind-${k}`}>{k}</span>
                        ))}
                        {resource.similarity != null && (
                            <span className='similarity'>{(resource.similarity * 100).toFixed(0)}% match</span>
                        )}
                    </div>
                    <a href={resource.url} className='modal-url' target='_blank' rel='noopener noreferrer'>{resource.url}</a>
                </div>

                {resource.descriptions.length > 0 && (
                    <div className='modal-section'>
                        <div className='modal-descriptions'>
                            {resource.descriptions.map((d, i) => (
                                <p key={i} className='modal-desc'>{d}</p>
                            ))}
                        </div>
                    </div>
                )}

                {resource.analysis && (
                    <div className='modal-section'>
                        <h3 className='modal-section-heading'>Analysis</h3>
                        <div className='modal-analysis'>{resource.analysis}</div>
                    </div>
                )}

                {(resource.topics.length > 0 || resource.regions.length > 0) && (
                    <div className='modal-section'>
                        <div className='modal-tags-block'>
                            {resource.topics.map((t) => (
                                <span key={t} className='tag topic'>{t}</span>
                            ))}
                            {resource.regions.map((reg) => (
                                <span key={reg} className='tag region'>{reg}</span>
                            ))}
                        </div>
                    </div>
                )}

                {resource.sources.length > 0 && (
                    <div className='modal-section modal-sources'>
                        <span className='modal-sources-label'>via</span>
                        {resource.sources.map((s, i) => (
                            <span key={s.name}>
                                {i > 0 && <span className='modal-sources-sep'>, </span>}
                                {s.url ? <a href={s.url} target='_blank' rel='noopener noreferrer'>{s.name}</a> : s.name}
                            </span>
                        ))}
                    </div>
                )}

                {related.length > 0 && (
                    <div className='modal-section'>
                        <h3 className='modal-section-heading'>Similar resources</h3>
                        <div className='modal-related'>
                            {related.map((rel) => (
                                <div key={rel.id} className='modal-related-item'>
                                    <div className='modal-related-header'>
                                        <a href={rel.url} target='_blank' rel='noopener noreferrer'>{rel.name}</a>
                                        <span className='modal-related-kinds'>
                                            {rel.kinds.map((k) => (
                                                <span key={k} className={`tag kind-${k}`}>{k}</span>
                                            ))}
                                        </span>
                                    </div>
                                    {rel.descriptions[0] && <p className='modal-related-desc'>{rel.descriptions[0]}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className='modal-footer'>
                    {resource.updated_at && <span>updated {new Date(resource.updated_at).toLocaleString()}</span>}
                    {resource.created_at && <span>added {new Date(resource.created_at).toLocaleString()}</span>}
                </div>
            </div>
        </div>
    );
}
