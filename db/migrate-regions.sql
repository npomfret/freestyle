CREATE TABLE IF NOT EXISTS resource_regions (
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    region      TEXT NOT NULL,
    PRIMARY KEY (resource_id, region)
);
CREATE INDEX IF NOT EXISTS idx_resource_regions_region ON resource_regions(region);
