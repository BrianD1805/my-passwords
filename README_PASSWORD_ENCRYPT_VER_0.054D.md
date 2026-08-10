# Password-Encrypt Ver-0.054D — Trusted Person UX correction

Ver-0.054D is a strict correction over Ver-0.054C. No Trusted Person flow logic, stage order, actions, email behaviour, or backend behaviour is changed.

## Changes

1. The separate **Designed for serious emergencies** help panel and its standalone help icon have been removed from the main Trusted Person flow.
2. That same serious-emergency explanation now lives inside the existing **How Emergency Access works** help section.
3. The active-stage blue rail has been restored to a thin 3px left border. Because it is the stage panel border itself, it runs from the top to the bottom of the complete stage panel and follows the existing rounded top-left and bottom-left corners cleanly.
4. The **Current progress** panel and the six-stage ordered journey remain unchanged from Ver-0.054C.

## Data / schema

No Supabase SQL migration is required for Ver-0.054D.
