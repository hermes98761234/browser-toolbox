// VCS Command Builder: offline data for common Git intents + a tiny template engine.
// Template syntax: {param} → shell-quoted value, {param?} → omitted when empty, [flag] → flag text when on.

/** [key, label, default, hint?] */
export type Param = [string, string, string, string?]
/** [key, text, explanation, on by default?] */
export type Flag = [string, string, string, boolean?]

export interface Intent {
  id: string
  cat: string
  t: string
  d: string
  k?: string
  p?: Param[]
  f?: Flag[]
  c: string[]
  w?: string
  u?: string
}

export const CATS = ['Start', 'Inspect', 'Stage & commit', 'Branches', 'Remote & sync', 'Undo & fix', 'Rewrite history', 'Stash', 'Tags & releases', 'Config', 'Advanced'] as const

export const INTENTS: Intent[] = [
  { id: 'init', cat: 'Start', t: 'Start a new repository', d: 'Create an empty repository in the current (or given) folder.', k: 'new create empty project',
    p: [['dir', 'Folder (optional)', '']], f: [['main', '-b main', 'Name the first branch "main" instead of the configured default.', true], ['bare', '--bare', 'Repository without a working tree (for a server/remote).']],
    c: ['git init[main][bare] {dir?}'] },
  { id: 'clone', cat: 'Start', t: 'Copy a remote repository', d: 'Download a repository with its full history.', k: 'download get checkout fetch project',
    p: [['url', 'Repository URL', 'https://github.com/user/project.git'], ['dir', 'Target folder (optional)', ''], ['br', 'Branch (used with --branch)', 'main']],
    f: [['shallow', '--depth 1', 'Only fetch the latest commit (fast, small, no history).'], ['branch', '--branch {br}', 'Check out this branch instead of the default one.'], ['sub', '--recurse-submodules', 'Also clone all submodules.']],
    c: ['git clone[shallow][branch][sub] {url} {dir?}'] },
  { id: 'status', cat: 'Inspect', t: 'See what changed', d: 'Show staged, unstaged and untracked files.', k: 'changes modified state diff',
    f: [['short', '-sb', 'Compact two-column output with branch info.', true], ['ign', '--ignored', 'Also list ignored files.']], c: ['git status[short][ign]'] },
  { id: 'diff', cat: 'Inspect', t: 'Show line changes', d: 'Compare the working tree with the index (or the index with the last commit).', k: 'compare difference patch',
    p: [['path', 'Limit to path (optional)', '']], f: [['staged', '--staged', 'Show what is staged for the next commit instead.'], ['word', '--word-diff', 'Highlight changed words, not whole lines.'], ['stat', '--stat', 'Only a per-file summary of changes.']],
    c: ['git diff[staged][word][stat] -- {path?}'] },
  { id: 'log', cat: 'Inspect', t: 'Browse history', d: 'List commits, newest first.', k: 'history commits graph list',
    p: [['n', 'Number of commits', '20']], f: [['one', '--oneline', 'One line per commit.', true], ['graph', '--graph --decorate', 'Draw the branch graph and show branch/tag names.', true], ['all', '--all', 'Include all branches, not just the current one.'], ['patch', '-p', 'Show the diff of every commit.']],
    c: ['git log[one][graph][all][patch] -n {n}'] },
  { id: 'logfile', cat: 'Inspect', t: 'History of one file', d: 'Every commit that touched a file, following renames.', k: 'file history who changed',
    p: [['path', 'File', 'src/app.ts']], f: [['follow', '--follow', 'Continue the history across renames.', true], ['patch', '-p', 'Show each change as a diff.']],
    c: ['git log[follow][patch] -- {path}'] },
  { id: 'blame', cat: 'Inspect', t: 'Who wrote each line', d: 'Annotate every line with the commit and author that last changed it.', k: 'author annotate responsible',
    p: [['path', 'File', 'src/app.ts'], ['range', 'Line range (optional, e.g. 10,40)', '']], f: [['ws', '-w', 'Ignore whitespace-only changes.'], ['moves', '-C', 'Detect lines moved or copied from other files.']],
    c: ['git blame[ws][moves][range] {path}'] },
  { id: 'search', cat: 'Inspect', t: 'Find when code was added', d: '"Pickaxe" search: commits that added or removed a string.', k: 'search find grep string introduced',
    p: [['text', 'Text to look for', 'TODO']], f: [['regex', '-G', 'Treat the text as a regular expression matched against diff lines (instead of -S).']],
    c: ['git log --oneline -S {text}'] },
  { id: 'grep', cat: 'Inspect', t: 'Search tracked files', d: 'Fast grep over the files Git tracks.', k: 'search find text code',
    p: [['text', 'Pattern', 'useEffect']], f: [['n', '-n', 'Show line numbers.', true], ['i', '-i', 'Case-insensitive.']], c: ['git grep[n][i] {text}'] },
  { id: 'show', cat: 'Inspect', t: 'Inspect one commit', d: 'Show a commit message and its diff (or a file at that commit).', k: 'view commit details',
    p: [['ref', 'Commit / ref', 'HEAD']], f: [['stat', '--stat', 'Only list changed files.']], c: ['git show[stat] {ref}'] },
  { id: 'add', cat: 'Stage & commit', t: 'Stage changes', d: 'Put changes in the index so the next commit includes them.', k: 'stage add files index',
    p: [['path', 'Path', '.']], f: [['patch', '-p', 'Pick hunks interactively.'], ['all', '-A', 'Also stage deletions everywhere in the repository.']], c: ['git add[patch][all] {path}'] },
  { id: 'commit', cat: 'Stage & commit', t: 'Commit staged changes', d: 'Record a snapshot of the index with a message.', k: 'save snapshot message',
    p: [['msg', 'Message', 'Fix login redirect']], f: [['all', '-a', 'Automatically stage modified and deleted tracked files first.'], ['sign', '-S', 'GPG/SSH-sign the commit.'], ['verify', '--no-verify', 'Skip pre-commit and commit-msg hooks.']],
    c: ['git commit[all][sign][verify] -m {msg}'] },
  { id: 'amend', cat: 'Stage & commit', t: 'Change the last commit', d: 'Add staged changes to the previous commit and/or edit its message.', k: 'fix forgot file message typo amend',
    p: [['msg', 'New message (empty = keep)', '']], f: [['noedit', '--no-edit', 'Keep the existing message (ignored if you give a new one).', true]],
    c: ['git commit --amend[noedit] -m {msg}'], w: 'Rewrites the last commit. If it is already pushed you will need a force push.', u: 'git reset --soft HEAD@{1}' },
  { id: 'unstage', cat: 'Stage & commit', t: 'Unstage a file', d: 'Remove a file from the index but keep your edits.', k: 'unadd remove from staging',
    p: [['path', 'Path', 'src/app.ts']], c: ['git restore --staged {path}'] },
  { id: 'rm', cat: 'Stage & commit', t: 'Stop tracking a file', d: 'Remove a file from the repository (optionally keep it on disk).', k: 'delete untrack gitignore',
    p: [['path', 'Path', '.env']], f: [['cached', '--cached', 'Keep the file on disk, only untrack it (then add it to .gitignore).', true], ['r', '-r', 'Recurse into directories.']], c: ['git rm[cached][r] {path}'] },
  { id: 'mv', cat: 'Stage & commit', t: 'Rename or move a file', d: 'Move a tracked file and stage the rename.', k: 'rename move',
    p: [['from', 'From', 'old.txt'], ['to', 'To', 'new.txt']], c: ['git mv {from} {to}'] },
  { id: 'branch', cat: 'Branches', t: 'Create and switch to a branch', d: 'Start a new branch from the current commit (or a given start point).', k: 'new branch feature create',
    p: [['name', 'Branch name', 'feature/login'], ['from', 'Start point (optional)', '']], c: ['git switch -c {name} {from?}'] },
  { id: 'switch', cat: 'Branches', t: 'Switch to an existing branch', d: 'Check out another branch.', k: 'checkout change go to',
    p: [['name', 'Branch', 'main']], f: [['discard', '--discard-changes', 'Throw away local modifications while switching.']], c: ['git switch[discard] {name}'], w: '--discard-changes deletes uncommitted work.' },
  { id: 'list', cat: 'Branches', t: 'List branches', d: 'Show local (and optionally remote) branches.', k: 'show all branches',
    f: [['all', '-a', 'Include remote-tracking branches.'], ['v', '-vv', 'Show last commit and upstream for each.', true], ['merged', '--merged', 'Only branches already merged into HEAD.']], c: ['git branch[all][v][merged]'] },
  { id: 'rename', cat: 'Branches', t: 'Rename a branch', d: 'Rename the current branch (or another one).', k: 'rename move branch master main',
    p: [['old', 'Old name (empty = current)', ''], ['name', 'New name', 'main']], c: ['git branch -m {old?} {name}'] },
  { id: 'delbranch', cat: 'Branches', t: 'Delete a local branch', d: 'Remove a branch you no longer need.', k: 'remove delete branch',
    p: [['name', 'Branch', 'feature/login']], f: [['force', '-D', 'Delete even if not merged (else -d refuses).']],
    c: ['git branch -d {name}'], w: 'With -D unmerged commits become reachable only via the reflog.' },
  { id: 'delremote', cat: 'Branches', t: 'Delete a remote branch', d: 'Remove a branch from the server.', k: 'remove remote branch origin',
    p: [['remote', 'Remote', 'origin'], ['name', 'Branch', 'feature/login']], c: ['git push {remote} --delete {name}'] },
  { id: 'merge', cat: 'Branches', t: 'Merge a branch into the current one', d: 'Combine the history of another branch.', k: 'combine integrate merge',
    p: [['name', 'Branch to merge', 'feature/login']], f: [['noff', '--no-ff', 'Always create a merge commit, even if a fast-forward is possible.'], ['squash', '--squash', 'Squash all changes into the index; commit them yourself.'], ['ffonly', '--ff-only', 'Refuse unless it is a fast-forward.']],
    c: ['git merge[noff][squash][ffonly] {name}'], u: 'git merge --abort   (during conflicts)  ·  git reset --hard ORIG_HEAD  (after)' },
  { id: 'rebase', cat: 'Branches', t: 'Rebase onto another branch', d: 'Replay your commits on top of another branch for a linear history.', k: 'update linear rebase main',
    p: [['onto', 'Upstream branch', 'origin/main']], f: [['auto', '--autostash', 'Stash local changes before and re-apply after.', true], ['upd', '--update-refs', 'Also move stacked branches that point into the rebased range.']],
    c: ['git fetch', 'git rebase[auto][upd] {onto}'], w: 'Rewrites commits; avoid on branches others have pulled.', u: 'git rebase --abort  ·  git reset --hard ORIG_HEAD' },
  { id: 'cherry', cat: 'Branches', t: 'Copy a commit from another branch', d: 'Apply the change of one commit on the current branch.', k: 'cherry pick copy commit port backport',
    p: [['ref', 'Commit', 'a1b2c3d']], f: [['x', '-x', 'Add "(cherry picked from …)" to the message.', true], ['n', '--no-commit', 'Apply the changes without committing.']],
    c: ['git cherry-pick[x][n] {ref}'], u: 'git cherry-pick --abort' },
  { id: 'remote', cat: 'Remote & sync', t: 'Connect a remote', d: 'Add a server URL under a short name.', k: 'origin add remote url github',
    p: [['name', 'Name', 'origin'], ['url', 'URL', 'git@github.com:user/project.git']], c: ['git remote add {name} {url}', 'git remote -v'] },
  { id: 'seturl', cat: 'Remote & sync', t: 'Change a remote URL', d: 'Point a remote somewhere else (e.g. HTTPS → SSH).', k: 'change url ssh https moved',
    p: [['name', 'Remote', 'origin'], ['url', 'New URL', 'git@github.com:user/project.git']], c: ['git remote set-url {name} {url}'] },
  { id: 'fetch', cat: 'Remote & sync', t: 'Download remote changes', d: 'Update remote-tracking branches without touching your work.', k: 'fetch download update',
    f: [['all', '--all', 'Fetch every remote.'], ['prune', '--prune', 'Drop tracking branches deleted on the server.', true], ['tags', '--tags', 'Fetch all tags.']], c: ['git fetch[all][prune][tags]'] },
  { id: 'pull', cat: 'Remote & sync', t: 'Update the current branch', d: 'Fetch and integrate the upstream branch.', k: 'pull sync update latest',
    f: [['rebase', '--rebase', 'Rebase your local commits instead of creating a merge commit.', true], ['ff', '--ff-only', 'Only fast-forward; fail if you have diverged.']], c: ['git pull[rebase][ff]'] },
  { id: 'push', cat: 'Remote & sync', t: 'Publish a branch', d: 'Upload commits and set the upstream on first push.', k: 'push upload publish',
    p: [['remote', 'Remote', 'origin'], ['name', 'Branch', 'feature/login']], f: [['u', '-u', 'Remember remote/branch as upstream for pull/push.', true], ['tags', '--follow-tags', 'Also push annotated tags reachable from the commits.']],
    c: ['git push[u][tags] {remote} {name}'] },
  { id: 'forcepush', cat: 'Remote & sync', t: 'Force-push safely', d: 'Overwrite the remote branch after a rebase/amend, but only if nobody else pushed meanwhile.', k: 'force push overwrite rebase',
    p: [['remote', 'Remote', 'origin'], ['name', 'Branch', 'feature/login']], f: [['ifinc', '--force-if-includes', 'Also verify you have seen the remote tip locally.', true]],
    c: ['git push --force-with-lease[ifinc] {remote} {name}'], w: 'Never force-push shared branches like main without agreement.' },
  { id: 'track', cat: 'Remote & sync', t: 'Set upstream of current branch', d: 'Tell Git which remote branch the current branch follows.', k: 'upstream tracking',
    p: [['up', 'Upstream', 'origin/main']], c: ['git branch --set-upstream-to={up}'] },
  { id: 'discard', cat: 'Undo & fix', t: 'Discard changes in a file', d: 'Restore a file to the last committed version.', k: 'undo revert file throw away changes',
    p: [['path', 'Path', 'src/app.ts'], ['ref', 'Source commit (used with --source)', 'HEAD~1']], f: [['src', '--source={ref}', 'Restore from a specific commit instead of the index.']],
    c: ['git restore[src] {path}'], w: 'Uncommitted edits in that file are lost for good.' },
  { id: 'undocommit', cat: 'Undo & fix', t: 'Undo the last commit (keep changes)', d: 'Move the branch back one commit; your changes stay staged.', k: 'undo last commit uncommit reset soft',
    p: [['n', 'How many commits', '1']], f: [['mixed', '--mixed', 'Keep changes but unstage them (instead of --soft).']],
    c: ['git reset --soft HEAD~{n}'], u: 'git reset --soft HEAD@{1}' },
  { id: 'hardreset', cat: 'Undo & fix', t: 'Throw away all local changes', d: 'Reset the branch and working tree to a commit (e.g. the remote state).', k: 'reset hard clean discard everything match remote',
    p: [['ref', 'Reset to', 'origin/main']], f: [['clean', '&& git clean -fd', 'Also delete untracked files and folders.']],
    c: ['git fetch', 'git reset --hard {ref}[clean]'], w: 'Destroys uncommitted work. Committed work is recoverable via git reflog for ~90 days.', u: 'git reflog  →  git reset --hard HEAD@{1}' },
  { id: 'revert', cat: 'Undo & fix', t: 'Undo a pushed commit', d: 'Create a new commit that reverses an earlier one (safe for shared history).', k: 'revert undo pushed public',
    p: [['ref', 'Commit', 'a1b2c3d']], f: [['noedit', '--no-edit', 'Use the default message.', true], ['m1', '-m 1', 'Needed when reverting a merge commit (keep parent 1).']],
    c: ['git revert[noedit][m1] {ref}'] },
  { id: 'reflog', cat: 'Undo & fix', t: 'Recover a lost commit', d: 'The reflog records where HEAD has been; branch from an old entry.', k: 'recover lost deleted branch reflog rescue',
    p: [['entry', 'Reflog entry', 'HEAD@{2}'], ['name', 'Rescue branch', 'rescue']], c: ['git reflog -n 20', 'git branch {name} {entry}'] },
  { id: 'clean', cat: 'Undo & fix', t: 'Delete untracked files', d: 'Remove files Git does not track.', k: 'clean untracked remove build artifacts',
    f: [['dry', '-n', 'Dry run: only list what would be removed.', true], ['d', '-d', 'Also remove untracked directories.', true], ['x', '-x', 'Also remove ignored files (build output, node_modules).']], c: ['git clean -f[dry][d][x]'], w: 'Without -n this cannot be undone.' },
  { id: 'squash', cat: 'Rewrite history', t: 'Squash the last N commits', d: 'Combine several commits into one with a new message.', k: 'squash combine commits cleanup',
    p: [['n', 'Number of commits', '3'], ['msg', 'New message', 'Add login page']], c: ['git reset --soft HEAD~{n}', 'git commit -m {msg}'], w: 'Rewrites history; force-push if already pushed.', u: 'git reset --hard HEAD@{2}' },
  { id: 'interactive', cat: 'Rewrite history', t: 'Edit, reorder or drop commits', d: 'Interactive rebase: pick, reword, squash, fixup, drop.', k: 'interactive rebase reorder reword edit drop',
    p: [['base', 'Base (exclusive)', 'HEAD~5']], f: [['auto', '--autosquash', 'Auto-arrange fixup!/squash! commits.', true]], c: ['git rebase -i[auto] {base}'], u: 'git rebase --abort  ·  git reset --hard ORIG_HEAD' },
  { id: 'fixup', cat: 'Rewrite history', t: 'Fix an older commit', d: 'Create a fixup commit and fold it into the target automatically.', k: 'fixup older commit correct',
    p: [['ref', 'Commit to fix', 'a1b2c3d']], c: ['git commit --fixup={ref}', 'git rebase -i --autosquash {ref}~1'] },
  { id: 'author', cat: 'Rewrite history', t: 'Fix author of last commit', d: 'Change name/e-mail on the last commit.', k: 'author email wrong identity',
    p: [['who', 'Author', 'Jane Doe <jane@example.com>']], c: ['git commit --amend --no-edit --author={who}'] },
  { id: 'stash', cat: 'Stash', t: 'Shelve work in progress', d: 'Save uncommitted changes and clean the working tree.', k: 'stash save shelve wip',
    p: [['msg', 'Description', 'WIP login form']], f: [['u', '-u', 'Include untracked files.', true], ['keep', '--keep-index', 'Keep staged changes in the working tree.']], c: ['git stash push[u][keep] -m {msg}'] },
  { id: 'pop', cat: 'Stash', t: 'Restore shelved work', d: 'Apply a stash and remove it from the list.', k: 'unstash pop apply',
    p: [['ref', 'Stash', 'stash@{0}']], f: [['apply', '(apply instead)', 'Use "apply" to keep the stash entry.']], c: ['git stash list', 'git stash pop {ref}'] },
  { id: 'stashbranch', cat: 'Stash', t: 'Turn a stash into a branch', d: 'Create a branch at the stash’s base and apply it there.', k: 'stash branch conflicts',
    p: [['name', 'Branch', 'wip/login'], ['ref', 'Stash', 'stash@{0}']], c: ['git stash branch {name} {ref}'] },
  { id: 'tag', cat: 'Tags & releases', t: 'Tag a release', d: 'Create an annotated tag and push it.', k: 'tag release version',
    p: [['tag', 'Tag', 'v1.2.0'], ['msg', 'Message', 'Release 1.2.0'], ['remote', 'Remote', 'origin']], f: [['sign', '-s', 'Sign the tag.']], c: ['git tag -a[sign] {tag} -m {msg}', 'git push {remote} {tag}'] },
  { id: 'deltag', cat: 'Tags & releases', t: 'Delete a tag', d: 'Remove a tag locally and on the remote.', k: 'remove tag',
    p: [['tag', 'Tag', 'v1.2.0'], ['remote', 'Remote', 'origin']], c: ['git tag -d {tag}', 'git push {remote} --delete {tag}'] },
  { id: 'changelog', cat: 'Tags & releases', t: 'Commits since last tag', d: 'Short changelog between the latest tag and HEAD.', k: 'changelog release notes since',
    c: ['git log --oneline --no-merges $(git describe --tags --abbrev=0)..HEAD'] },
  { id: 'archive', cat: 'Tags & releases', t: 'Export a snapshot as zip', d: 'Archive the tree of a commit without the .git folder.', k: 'zip tar export archive',
    p: [['ref', 'Ref', 'v1.2.0'], ['out', 'Output file', 'release.zip']], c: ['git archive --format=zip -o {out} {ref}'] },
  { id: 'identity', cat: 'Config', t: 'Set your name and e-mail', d: 'Identity recorded in every commit.', k: 'config user name email setup',
    p: [['name', 'Name', 'Jane Doe'], ['email', 'E-mail', 'jane@example.com']], f: [['global', '--global', 'For all repositories (otherwise only this one).', true]],
    c: ['git config[global] user.name {name}', 'git config[global] user.email {email}'] },
  { id: 'alias', cat: 'Config', t: 'Create an alias', d: 'Shortcut for a longer command.', k: 'alias shortcut',
    p: [['name', 'Alias', 'lg'], ['cmd', 'Command', 'log --oneline --graph --decorate --all']], c: ['git config --global alias.{name} {cmd}'] },
  { id: 'ignore', cat: 'Config', t: 'Ignore files', d: 'Append a pattern to .gitignore and untrack matching files.', k: 'gitignore ignore exclude',
    p: [['pat', 'Pattern', 'node_modules/']], c: ['echo {pat} >> .gitignore', 'git rm -r --cached {pat}', 'git add .gitignore'] },
  { id: 'defaults', cat: 'Config', t: 'Sensible defaults', d: 'Rebase on pull, prune on fetch, main as default branch.', k: 'config defaults setup recommended',
    c: ['git config --global pull.rebase true', 'git config --global fetch.prune true', 'git config --global init.defaultBranch main', 'git config --global rerere.enabled true'] },
  { id: 'bisect', cat: 'Advanced', t: 'Find the commit that broke something', d: 'Binary search through history.', k: 'bisect bug regression find broken',
    p: [['bad', 'Bad commit', 'HEAD'], ['good', 'Last known good', 'v1.1.0'], ['test', 'Test command (optional)', 'npm test']],
    c: ['git bisect start {bad} {good}', 'git bisect run {test}', 'git bisect reset'] },
  { id: 'worktree', cat: 'Advanced', t: 'Second working folder', d: 'Check out another branch in a separate directory without stashing.', k: 'worktree parallel folder',
    p: [['dir', 'Folder', '../hotfix'], ['name', 'Branch', 'hotfix/crash']], f: [['new', '-b {name}', 'Create the branch.', true]], c: ['git worktree add[new] {dir}'] },
  { id: 'submodule', cat: 'Advanced', t: 'Update submodules', d: 'Initialise and check out all submodules recursively.', k: 'submodule update init',
    f: [['remote', '--remote', 'Move submodules to their remote branch tip.']], c: ['git submodule update --init --recursive[remote]'] },
  { id: 'sparse', cat: 'Advanced', t: 'Check out only some folders', d: 'Sparse checkout for huge monorepos.', k: 'sparse partial monorepo',
    p: [['dirs', 'Folders', 'apps/web']], c: ['git sparse-checkout set {dirs}'] },
  { id: 'lfs', cat: 'Advanced', t: 'Store big files with LFS', d: 'Track large binaries with Git LFS.', k: 'lfs large binary files',
    p: [['pat', 'Pattern', '*.psd']], c: ['git lfs install', 'git lfs track {pat}', 'git add .gitattributes'] },
  { id: 'gc', cat: 'Advanced', t: 'Shrink the repository', d: 'Pack objects and prune unreachable ones.', k: 'gc cleanup size compress',
    f: [['agg', '--aggressive', 'Slower, smaller packs.']], c: ['git count-objects -vH', 'git gc[agg] --prune=now'] },
]

/** Quote a value for POSIX shells only when needed. */
export function shq(v: string): string {
  if (v === '') return "''"
  if (/^[A-Za-z0-9_./:@%+=,~^{}-]+$/.test(v) && !/^[~]/.test(v)) return v
  return `'${v.replace(/'/g, `'\\''`)}'`
}

/** Expand a template with param values and flag states. */
export function render(tpl: string, vals: Record<string, string>, flags: Record<string, boolean>, intent?: Intent): string {
  const sub = (s: string) =>
    s.replace(/\{(\w+)(\?)?\}/g, (_, k: string, opt?: string) => {
      const v = (vals[k] ?? '').trim()
      if (!v && opt) return ''
      return shq(v)
    })
  const withFlags = tpl.replace(/\[(\w+)\]/g, (_, k: string) => {
    const f = intent?.f?.find((x) => x[0] === k)
    if (!f || !flags[k] || f[1].startsWith('(')) return ''
    return ' ' + f[1]
  })
  return sub(withFlags).replace(/[ \t]+/g, ' ').trim()
}

/** Build all command lines for an intent; handles a few intent-specific tweaks. */
export function build(it: Intent, vals: Record<string, string>, flags: Record<string, boolean>): string[] {
  let lines = it.c
  if (it.id === 'amend' && (vals.msg ?? '').trim()) lines = ['git commit --amend -m {msg}']
  else if (it.id === 'amend') lines = ['git commit --amend[noedit]']
  if (it.id === 'delbranch' && flags.force) lines = ['git branch -D {name}']
  if (it.id === 'undocommit' && flags.mixed) lines = ['git reset --mixed HEAD~{n}']
  if (it.id === 'search' && flags.regex) lines = ['git log --oneline -G {text}']
  if (it.id === 'pop' && flags.apply) lines = ['git stash list', 'git stash apply {ref}']
  if (it.id === 'bisect' && !(vals.test ?? '').trim()) lines = ['git bisect start {bad} {good}', '# test, then mark: git bisect good | git bisect bad', 'git bisect reset']
  if (it.id === 'blame' && (vals.range ?? '').trim()) lines = [lines[0].replace('[range]', ' -L {range}')]
  return lines.map((l) => render(l, vals, flags, it))
}

/** Rank intents for a plain-language query (all words must match somewhere). */
export function search(q: string, list: Intent[] = INTENTS): Intent[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  if (!words.length) return list
  const scored = list.map((it) => {
    const title = it.t.toLowerCase()
    const hay = `${title} ${it.d} ${it.k ?? ''} ${it.c.join(' ')}`.toLowerCase()
    let score = 0
    for (const w of words) {
      const stem = w.length > 4 ? w.slice(0, -1) : w
      if (title.includes(stem)) score += 3
      else if (hay.includes(stem)) score += 1
    }
    return { it, score }
  })
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.it)
}

export function defaults(it: Intent): { vals: Record<string, string>; flags: Record<string, boolean> } {
  return {
    vals: Object.fromEntries((it.p ?? []).map((p) => [p[0], p[2]])),
    flags: Object.fromEntries((it.f ?? []).map((f) => [f[0], !!f[3]])),
  }
}
