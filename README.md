# chordiebook-ui

Generate the catalog and page with `make catalog` (requires AWS access to the
configured S3 bucket). Song names come from the ChordPro `{title: ...}` directive
in each `.cho` file, preserving accents and capitalization. The `{t: ...}` alias
is also supported. Songs without a nonempty title use the filename as a fallback.
