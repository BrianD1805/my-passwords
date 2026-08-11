# Password-Encrypt Ver-0.054H — Trusted Person Emergency Flow UX

Ver-0.054H refines the owner-facing Trusted Person Planning flow without changing the approved Emergency Access backend, emails, waiting-period handling, quarterly reminder process, or release security.

## Changes

1. The top heading is now **Trusted Person Planning** with a Help icon on the same line.
2. The Help icon opens one popup containing the serious-emergency explanation and all Trusted Person / Emergency Access FAQs.
3. The previous separate **How Emergency Access works** accordion has been removed to avoid duplicated help content.
4. **Current progress** is now setup-only and displays **Stage X of 4 setup**.
5. Tapping Current progress opens and scrolls directly to the setup stage named in the progress panel.
6. Stages 1–4 are explicitly presented as the Trusted Person setup journey.
7. Stages 5–6 are visually separated and labelled **Emergency-only stages**; they do not count against setup completion.
8. The approved Ver-0.054G stage-header blue corner wrap and separated editor content remain unchanged.

## Setup / deployment

No Supabase SQL is required.
No new Netlify environment variables are required.

Local verification from the existing project directory:

```bat
npm run security:check && npm run reliability:check && npm run legal:check && npm run ux:check && npm run mobile:check && npm run emergency:check && npm run build && netlify dev --no-open
```

Deploy:

```bat
git status && git add -A && git commit -m "Password-Encrypt Ver-0.054H Trusted Person flow setup and help UX" && git push origin main
```
