# Password-Encrypt Ver-0.054E — Trusted Person automatic progression and rail refinement

Ver-0.054E makes two focused improvements over Ver-0.054D.

1. The active-stage blue rail remains a subtle 3px accent but now wraps a short distance around the top-left and bottom-left corners so the rail follows the rounded stage card cleanly.
2. Trusted Person Access automatically refreshes its server-side flow state every 30 seconds while the owner has the section open, and immediately when the section opens or returns to the foreground. The encrypted local flow metadata is only saved when the server state actually changes.

Acceptance is already recorded immediately by the public acceptance endpoint. The acceptance email containing the separate Request Emergency Access link is sent at that point. The automatic owner polling simply advances the visible owner journey without requiring a manual Check acceptance action.

The final Emergency Package email is not sent on acceptance. It remains controlled by the emergency-access-release-process scheduled function, which runs every five minutes after an Emergency Access request has been made and the waiting period has expired.

No Supabase SQL migration or new environment variables are required.
