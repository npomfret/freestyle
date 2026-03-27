import type { Resource } from './types';
import { timeAgo } from './utils';

interface ResourceCardProps {
    resource: Resource;
    showAge?: boolean;
    onTopicClick: (topic: string) => void;
    onRegionClick: (region: string) => void;
    onSelect: (id: number) => void;
}

export default function ResourceCard({ resource: r, showAge, onTopicClick, onRegionClick, onSelect }: ResourceCardProps) {
    return (
        <div className='card' onClick={() => onSelect(r.id)} style={{ cursor: 'pointer' }}>
            <div className='card-header'>
                <a href={r.url} target='_blank' rel='noopener noreferrer' onClick={(e) => e.stopPropagation()}>
                    {r.name}
                </a>
                {r.similarity != null && (
                    <span className='similarity'>
                        {(r.similarity * 100).toFixed(0)}% match
                    </span>
                )}
                {showAge && r.created_at && <span className='card-age'>{timeAgo(r.created_at)}</span>}
                <span className='expand-indicator'>›</span>
            </div>
            {r.descriptions.length > 0 && <p className='description'>{r.descriptions[0]}</p>}
            <div className='tags'>
                {r.kinds.map((k) => (
                    <span key={k} className={`tag kind-${k}`}>{k}</span>
                ))}
                {r.topics.map((t) => (
                    <span
                        key={t}
                        className='tag topic'
                        onClick={(e) => { e.stopPropagation(); onTopicClick(t); }}
                    >
                        {t}
                    </span>
                ))}
                {r.regions.map((reg) => (
                    <span
                        key={reg}
                        className='tag region'
                        onClick={(e) => { e.stopPropagation(); onRegionClick(reg); }}
                    >
                        {reg}
                    </span>
                ))}
            </div>
            <div className='card-meta'>
                <a href={r.url} className='card-url' target='_blank' rel='noopener noreferrer' onClick={(e) => e.stopPropagation()}>{r.url}</a>
                {r.updated_at && (
                    <span className='card-updated' title={new Date(r.updated_at).toLocaleString()}>
                        updated {timeAgo(r.updated_at)}
                    </span>
                )}
            </div>
        </div>
    );
}
