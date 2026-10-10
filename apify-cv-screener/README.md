# TalentLenses Apify CV Screener

This Actor receives an already-extracted CV batch from TalentLenses, scores each CV
through OpenRouter, and writes one result per `screeningId` to the default dataset.

Configure `OPENROUTER_API_KEY` and optionally `OPENROUTER_MODEL` as Apify Secrets.
Do not include either value in Actor input, dataset items, logs, or the TalentLenses
VPS environment.

The Actor input is supplied by TalentLenses. Its required fields are `batchId`,
`jobTitle`, `jobDescription`, and `screenings`, where each screening has
`screeningId`, `fileName`, and `resumeText`.