-- Migrate topic taxonomy from 32 broad labels to 71 specific ones.
-- Drops the old unnamed CHECK constraint, remaps existing rows, adds new constraint.

DO $$
DECLARE v_constraint_name TEXT;
BEGIN
    SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'resource_topics'::regclass AND contype = 'c';
    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE resource_topics DROP CONSTRAINT %I', v_constraint_name);
    END IF;
END $$;

-- Remap old topic names to new vocabulary
UPDATE resource_topics SET topic = 'crops'         WHERE topic = 'agriculture';
UPDATE resource_topics SET topic = 'crypto'        WHERE topic = 'blockchain';
UPDATE resource_topics SET topic = 'ai-ml'         WHERE topic = 'data-science';
UPDATE resource_topics SET topic = 'banking'       WHERE topic = 'finance';
UPDATE resource_topics SET topic = 'gaming'        WHERE topic = 'games';
UPDATE resource_topics SET topic = 'earth-science' WHERE topic = 'geoscience';
UPDATE resource_topics SET topic = 'public-health' WHERE topic = 'health';
UPDATE resource_topics SET topic = 'demographics'  WHERE topic = 'social-science';
UPDATE resource_topics SET topic = 'logistics'     WHERE topic = 'transport';

-- Add new constraint with full 71-topic vocabulary
ALTER TABLE resource_topics ADD CHECK (topic IN (
    'banking', 'capital-markets', 'forex', 'commodities', 'economics',
    'insurance', 'crypto', 'alternative-data',
    'oil-gas', 'electricity', 'renewables', 'utilities',
    'crops', 'livestock', 'food',
    'climate', 'pollution', 'biodiversity', 'oceans',
    'public-health', 'clinical', 'pharma', 'mental-health',
    'chemistry', 'physics', 'biology', 'earth-science', 'materials',
    'neuroscience', 'drug-discovery', 'open-science',
    'space', 'astronomy', 'remote-sensing',
    'roads-traffic', 'public-transit', 'maritime', 'aviation', 'logistics',
    'ai-ml', 'nlp', 'iot', 'cybersecurity', 'developer', 'cloud',
    'government', 'law', 'crime', 'military',
    'demographics', 'education', 'employment', 'housing',
    'journalism', 'social-media', 'audio', 'images-video',
    'retail', 'manufacturing', 'construction',
    'sports', 'entertainment', 'gaming',
    'geospatial', 'urban',
    'humanitarian', 'trade',
    'bioinformatics', 'semantic-web', 'humanities', 'robotics'
));
