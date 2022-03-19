# ansible
export PATH="$HOME/Library/Python/3.8/bin:/opt/homebrew/bin:$PATH"

# git completion
zstyle ':completion:*:*:git:*' script ~/.zsh/git-completion.bash
fpath+=~/.zsh
autoload -Uz compinit && compinit

# pure
fpath+=$(brew --prefix)/share/zsh/site-functions
autoload -U promptinit; promptinit
prompt pure

# volta
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"

# zsh-autosuggestions
source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh

# zsh-syntax-highlighting
source $(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# ---

# aliases
alias egrep='egrep --color=auto'
alias fgrep='fgrep --color=auto'
alias grep='grep --color=auto'
alias ls='ls -FG'
alias ll='ls -l'
alias la='ls -la'
alias timestamp='node -e "console.log(Date.now())"'
alias uuid='node -e "console.log(require(\"crypto\").randomUUID())"'
alias vim='nvim'
alias zshrc="vim ~/.zshrc && zsource"
alias zsource="source ~/.zshrc && source ~/.zprofile"
alias aws="aws --profile default"

# exiftool renames
#exiftool -d '%Y-%m-%d %H.%M.%S' -ext jpg '-FileName<${FileModifyDate} ${ImageSize}%-c.${FileTypeExtension}' '-FileName<${CreateDate} ${ImageSize}%-c.${FileTypeExtension}' '-FileName<${DateTimeOriginal} ${ImageSize}%-c.${FileTypeExtension}' .
#exiftool -d '%Y-%m-%d %H.%M.%S' -ext mov '-FileName<${FileModifyDate} ${ImageSize} ${Duration}.${FileTypeExtension}' '-FileName<${CreateDate} ${ImageSize} ${Duration}.${FileTypeExtension}' '-FileName<${DateTimeOriginal} ${ImageSize} ${Duration}.${FileTypeExtension}' .
#exiftool -r -d '%Y-%m-%d  %H.%M.%S' -ext jpg -ext png -ext bmp '-FileName<${FileModifyDate}  ${ImageSize}  ${FileSize}%-c.${FileTypeExtension}' '-FileName<${CreateDate}  ${ImageSize}  ${FileSize}%-c.${FileTypeExtension}' '-FileName<${DateTimeOriginal}  ${ImageSize}  ${FileSize}%-c.${FileTypeExtension}' .
#exiftool -r -d '%Y-%m-%d  %H.%M.%S' -ext avi -ext mov -ext mp4 -ext 3gp '-FileName<${FileModifyDate}  ${ImageSize}  ${Duration}  ${FileSize}%-c.${FileTypeExtension}' '-FileName<${CreateDate}  ${ImageSize}  ${Duration}  ${FileSize}%-c.${FileTypeExtension}' '-FileName<${DateTimeOriginal}  ${ImageSize}  ${Duration}  ${FileSize}%-c.${FileTypeExtension}' .

# git
git config --global pager.branch false
git config --global alias.a add
git config --global alias.ac 'commit --amend'
git config --global alias.b branch
git config --global alias.ba 'branch -a'
git config --global alias.c checkout
git config --global alias.cam 'commit --am'
git config --global alias.co 'commit -m'
git config --global alias.d 'branch -d'
git config --global alias.D 'branch -D'
git config --global alias.df diff
git config --global alias.f 'fetch origin --prune'
git config --global alias.fp 'push -f'
git config --global alias.l log
git config --global alias.ll 'log --oneline'
git config --global alias.p pull
git config --global alias.pu push
git config --global alias.s status
git config --global alias.sh show

# funcs
function refreshd {
  git checkout develop
  git pull
}

function refreshm {
  git branch | grep -E '(main|master)' | xargs -n 1 git checkout
  git pull
}

function rmbranches {
  git fetch origin --prune | grep -v '\*' | xargs -n 1 git branch -d
  git pull
}

function mergem {
  refreshm
  git checkout -
  git branch | grep -E '(main|master)' | xargs -n 1 git merge
}

function rebased {
  refreshd
  git checkout -
  git rebase develop
}

function rebasem {
  refreshm
  git checkout -
  git branch | grep -E '(main|master)' | xargs -n 1 git rebase
}

function yolo {
  git add .
  git commit --amend --no-verify
  git push --force --no-verify
}

function effit {
  git add .
  git commit --amend --no-verify
  rebasem
  git push --force --no-verify
}

function kp {
  echo "killing pid: $(lsof -ti:$1)"
  lsof -ti:$1 | xargs kill
}

function xcode-install {
  xcode-select --install
}

function xcode-reinstall {
  sudo rm -rf $(xcode-select -print-path)
  xcode-install
}
