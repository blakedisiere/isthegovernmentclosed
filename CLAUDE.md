# CLAUDE.md

## Project Overview

**isthegovernmentclosed** — A project to determine and display whether the U.S. government is currently closed (e.g., due to a shutdown). The repository is in its early stages.

## Repository Structure

```
isthegovernmentclosed/
├── CLAUDE.md        # AI assistant guidance (this file)
└── README.md        # Project README
```

## Tech Stack

Not yet established. No frameworks, build tools, or dependencies have been added.

## Development Workflow

### Branches

- `main` — Primary branch (remote default)
- `master` — Local default branch from initial commit
- Feature branches use the `claude/` prefix convention

### Git Conventions

- Commit messages should be clear and descriptive
- Use feature branches for all new work
- Push with `git push -u origin <branch-name>`

## Getting Started

This project is in its initial stage. When adding code:

1. Choose a tech stack appropriate for a "is the government closed" status site
2. Add a `.gitignore` for the chosen stack
3. Set up a `package.json`, `requirements.txt`, or equivalent dependency file
4. Add build/dev/test scripts

## Key Conventions

- Keep the codebase simple and focused on the core question: "Is the government closed?"
- Prefer clear, readable code over clever abstractions
- Add tests alongside new functionality
- Update this file as the project evolves
