# Git Commit Message Standards

**File:** `docs/codepolicy/GIT_COMMIT_STANDARDS.md`  
**Purpose:** Define standardized git commit message format for consistent project history  
**Audience:** Developers, AI assistants, and automated systems  
**Last Updated:** 2025-06-21  

## 📋 Overview

This document establishes the git commit message standards for the Fixed Ratio Trading project. Consistent commit messages improve code review efficiency, automated tooling, and project history readability.

## 🏗️ Commit Message Structure

```
<type>: <subject line under 72 characters>

<optional body with detailed explanation>
- Bullet point 1 with specific details
- Bullet point 2 with metrics/numbers when applicable  
- Bullet point 3 with context or reasoning
- Additional bullets as needed

<optional footer with references>
```

## 📝 Subject Line Guidelines

### Length Limit
- **Maximum 72 characters** (enforced)
- Aim for **50-60 characters** when possible
- No period at the end

### Format
```
<type>: <description starting with verb>
```

### Required Elements
1. **Type prefix** (see types below)
2. **Colon and space** after type
3. **Imperative mood** (e.g., "Add", "Fix", "Update", not "Added", "Fixed", "Updated")
4. **Lowercase first letter** after colon (except proper nouns)

## 🏷️ Commit Types

| Type | Purpose | Examples |
|------|---------|----------|
| `feat` | New features | `feat: Add liquidity pool creation endpoint` |
| `fix` | Bug fixes | `fix: Resolve token calculation overflow error` |
| `docs` | Documentation | `docs: Update API documentation for swap endpoints` |
| `test` | Testing | `test: Complete LIQ-001 basic deposit functionality` |
| `refactor` | Code refactoring | `refactor: Extract common validation logic to utils` |
| `perf` | Performance improvements | `perf: Optimize token swap calculation algorithm` |
| `style` | Code style/formatting | `style: Format code according to rustfmt standards` |
| `build` | Build system/dependencies | `build: Update Cargo.toml dependencies to latest` |
| `ci` | CI/CD changes | `ci: Add automated coverage reporting workflow` |
| `chore` | Maintenance tasks | `chore: Update development environment setup` |
| `revert` | Reverting changes | `revert: Revert "feat: Add experimental swap feature"` |

## 📖 Body Guidelines

### When to Include a Body
- **Always include** for significant changes
- **Required** for features, fixes, and refactors
- **Optional** for simple documentation or style changes

### Formatting Rules
1. **Blank line** between subject and body
2. **Bullet points** for multiple changes using `-` or `•`
3. **Specific details** with metrics, file names, or technical specifics
4. **72-character line limit** for body text
5. **Present tense** and **imperative mood**

### Content Guidelines
- **What changed** (specific files, functions, or features)
- **Why the change** was made (context, reasoning)
- **Impact** of the change (performance, behavior, breaking changes)
- **Metrics** when applicable (coverage %, line counts, test numbers)

## ✨ Emoji Usage (Optional but Encouraged)

Use emojis **in body bullet points** for visual clarity:

| Emoji | Usage | Example |
|-------|-------|---------|
| ✅ | Completed items | `✅ Completed: All 16 system pause tests passing` |
| 🔧 | Bug fixes/technical work | `🔧 Fixed: Buffer serialization issue in PDA calls` |
| 📊 | Metrics/statistics | `📊 Coverage: Improved from 32% to 47% (1,188/2,508 lines)` |
| 🎯 | Goals/targets achieved | `🎯 Target: Reached Phase 1 milestone (24/37 tests)` |
| 🚨 | Critical issues | `🚨 Critical: Fixed security vulnerability in fee validation` |
| 📝 | Documentation | `📝 Updated: API documentation with new endpoints` |
| ⚡ | Performance | `⚡ Performance: 40% faster token swap calculations` |
| 🔄 | Refactoring | `🔄 Refactored: Consolidated duplicate validation logic` |

## 📚 Examples

### ✅ Good Examples

#### Feature Addition
```
feat: Add deposit with slippage protection functionality

- ✅ Implemented process_deposit_with_features function
- 🔧 Added slippage tolerance validation (configurable %)
- 📊 Enhanced deposit flow with minimum LP token guarantees
- 🎯 Completed LIQ-002 test with both success and failure cases
- ⚡ Optimized for 1:1 LP token minting ratio
```

#### Bug Fix
```
fix: Resolve PDA data corruption in invoke_signed operations

- 🔧 Applied Buffer Serialization Workaround pattern
- 📝 Added comprehensive module documentation
- ✅ Fixed: All 18 liquidity tests now passing
- 🚨 Critical: Prevents data corruption during PDA operations
- 📊 Impact: Resolves failures in deposit/withdrawal functions
```

#### Testing
```
test: Complete SDK-001 through SDK-005 client initialization tests

- ✅ Added PoolClient initialization and configuration validation
- 📊 Coverage: Client SDK improved from 21.3% to 47.2%
- 🔧 Implemented PDA derivation accuracy verification
- 🎯 Completed: Pool creation instruction building tests
- ✅ Added error handling for non-existent pool states
```

#### Documentation
```
docs: Update comprehensive testing plan with current progress

- 📊 Updated coverage: 47.37% (1,188/2,508 lines covered)
- 📝 Updated test count: 101 total tests passing
- 🎯 Phase 1 progress: 65% complete (24/37 tests)
- 🚨 Identified critical priority: Processors/Swap (5.1% coverage)
- ✅ Noted improvements: Client SDK and Validation modules
```

### ❌ Poor Examples

#### Too Vague
```
fix: bug fix
update: changes
feat: new stuff
```

#### Too Long Subject
```
feat: Add comprehensive liquidity management system with deposit, withdrawal, slippage protection, and fee calculation
```

#### Missing Context
```
fix: Resolve issue

Fixed the problem.
```

#### Wrong Tense/Mood
```
feat: Added new feature
fix: Fixed the bug
docs: Updated documentation
```

## 🔧 Tools and Enforcement

### Recommended Tools
- **commitizen**: Interactive commit message helper
- **conventional-changelog**: Automated changelog generation
- **git hooks**: Pre-commit message validation

### Git Hook Example
```bash
#!/bin/sh
# commit-msg hook
commit_regex='^(feat|fix|docs|test|refactor|perf|style|build|ci|chore|revert):.{1,50}'
if ! grep -qE "$commit_regex" "$1"; then
    echo "Invalid commit message format!"
    echo "Format: <type>: <description under 72 chars>"
    exit 1
fi
```

## 🎯 Special Cases

### Test Completions
For test completion commits, follow this specific format:
```
test: Complete <TEST-ID> <description> - <summary of work>

- ✅ Completed: <specific functionality tested>
- 🔧 Features tested: <list of key features>
- 📊 Coverage: <coverage impact if known>
- 🎯 Results: <key outcomes or verification>
```

### Breaking Changes
Mark breaking changes clearly:
```
feat!: Redesign token swap API with new parameter structure

- 🚨 BREAKING: Changed swap function signature
- 🔄 Migrated: Old swap_tokens() to swap_with_params()
- 📝 Updated: All documentation and examples
- ✅ Backward compatibility: Maintained through v1 wrapper
```

### Dependency Updates
```
build: Update Solana dependencies to v1.18.0

- ⬆️ Updated: solana-program from v1.17.0 to v1.18.0
- ⬆️ Updated: spl-token from v4.0.0 to v4.1.0
- 🔧 Fixed: Compatibility issues with new SDK
- ✅ Verified: All tests passing with new dependencies
```

## 📋 Checklist Before Committing

- [ ] Subject line under 72 characters
- [ ] Proper type prefix used
- [ ] Imperative mood in subject
- [ ] Body explains what, why, and impact
- [ ] Specific details with metrics when applicable
- [ ] Emojis used appropriately for clarity
- [ ] No spelling/grammar errors
- [ ] References to issues/PRs when relevant

## 🤝 Collaboration Guidelines

### For AI Systems
- Always follow this format when making commits
- Include specific metrics and technical details
- Use appropriate emojis for visual clarity
- Reference test IDs and coverage changes when applicable

### For Human Developers
- Review commit messages before pushing
- Use `git commit --amend` to fix messages if needed
- Squash related commits before merging to main
- Write commit messages for future developers, not just yourself

## 📚 References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [How to Write a Git Commit Message](https://chris.beams.io/posts/git-commit/)
- [Angular Commit Message Guidelines](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit)

---

**Note:** This document is living and may be updated as project needs evolve. All team members and AI systems should adhere to these standards for consistent project history. 