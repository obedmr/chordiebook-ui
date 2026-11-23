# chordiebook-ui

Generate the catalog and page with `make catalog` (requires AWS access to the
configured S3 bucket). Song names come from the ChordPro `{title: ...}` directive
in each `.cho` file, preserving accents and capitalization. The `{t: ...}` alias
is also supported. Songs without a nonempty title use the filename as a fallback.

Run `make publish-catalog` (or `make submit`) to regenerate the catalog, commit
changes to the generated JSON, HTML, and minified assets, and push. The current
branch must have an upstream and no staged changes. Other files are left out of
the commit. If generated files are unchanged, the push runs without a new commit.
AWS and generator options work as usual, for example
`make publish-catalog AWS_PROFILE=default`.

A rejected push leaves the commit locally so you can integrate remote changes
and retry with `git push`.
