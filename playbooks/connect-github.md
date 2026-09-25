# Playbook: connect GitHub engineering

Goal: enable GitHub-backed engineering without asking the user to manually configure Merge Relay as
a GitHub App.

1. Determine the target repository and requested feature.
2. Convert the feature into logical GitHub capabilities.
3. Ask the credential-broker adapter (normally ZeroCreds) for a GitHub binding.
4. Validate repository reachability and only the required capabilities.
5. Store capability availability / opaque credential reference, never a raw token in project files.
6. If merge coordination is enabled, register the repository with the Merge Relay API.
7. Report enabled and unavailable capabilities with actionable reasons.

Do not place GitHub credentials in prompts, Task Packets, repository indexes, or `.engineering/project.yml`.
