# Description
Build a web3-native application where all data lives on Arkiv. Users own their data, instead of their data being owned by the platform.

Three theme options
Mix freely. All themes are scored equally.

AI: agents whose memory you actually own.
Privacy: confidential data patterns on a public, tamper-proof layer.
DePIN: a queryable data layer for sensor, telemetry, and device data.
Minimum technical requirements
Define and use a unique PROJECT_ATTRIBUTE on every entity and query.
At least 2 entity types.
Open-source GitHub repository.
Working demo link.
README with setup instructions.
Submission requirements
Theme: AI, Privacy, DePIN, or explicit hybrid.
GitHub repo: public, open source, with setup instructions.
Demo link: working deployment on Arkiv Braga testnet.
Demo video: optional at submission, required for prize claim (2 to 3 minutes).
Team info: names, GitHub handles, wallet address for prize distribution.
Submit at: forms.arkiv.network/ethns-arkiv-challenge
Key architectural concepts
Entities contain a payload (JSON, text, or bytes), typed attributes (the indexing layer), content type, and an expiresIn duration.
Metadata fields: $owner (mutable, controls update and delete) and $creator (immutable, tamper-proof attribution).
Relationships: implement via shared attribute keys using parent entity keys as values.
Instructions
Pick your theme.
Read the Arkiv fundamentals documentation.
Install the Arkiv agent skill for coding assistance.
Configure PROJECT_ATTRIBUTE before writing entity code.
Connect to the Braga testnet (faucet and explorer are provided).
Implement create, read, and query for one entity type first.
Join the Arkiv Discord and post in #ethns-arkiv-challenge. The Arkiv team is on call daily during the build window.

# Policies
AI policy for code
In short: of course you can use AI to code, but you should use it intelligently.

A few key points (with more here):

First, AI doesn't do software end-to-end. It does it middle-to-middle. So you need to write a good prompt, and then you need to aggressively verify the output.

If you have AI copy on the page, that's the new lorem ipsum. It's a placeholder, but you usually don't want it to be the final version. You want to clean up the output of AI.

AI is helpful for data analysis, for frontend code, for images and for videos. In all those cases you can instantly evaluate the results with your eye. You essentially have built-in GPUs, so that's fast. But for backend code, for systems programming, and for smart contracts, you need to verify the logic step by step.

In general, the right amount of AI use is neither 0% nor 100%. If you're at 0%, you're too slow. And if you're at 100%, it's all slop. The right amount is situational, but 100% AI currently doesn't generate optimal results.

So: when writing your code, feel free to use as much or as little AI as you want to generate it. However, your output should not be raw AI without your thorough review and verification. After all, you're putting your name on it, and you're responsible for ensuring that the result is high quality. We want a fully-baked result, not a half-baked result.