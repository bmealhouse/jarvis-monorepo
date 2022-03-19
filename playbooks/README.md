# Ansible Playbooks

> Automated Mac setup and configuration with Ansible

These playbooks install and configure most of the Mac software I use for software development.

## Installation

1. Ensure Apple's command line tools are installed (`xcode-select --install` to launch the installer).
2. [Install Ansible](https://docs.ansible.com/ansible/latest/installation_guide/index.html):

   1. Run the following command to add Python 3 to your $PATH: `export PATH="$HOME/Library/Python/3.8/bin:/opt/homebrew/bin:$PATH"`
   2. Upgrade Pip: `pip3 install --upgrade pip`
   3. Install Ansible: `pip3 install ansible yamllint ansible-lint`

3. Download this repository to your mac.
4. Run `ansible-galaxy install -r requirements.yml` inside this directory to install required Ansible roles.
5. Run `ansible-playbook dev/main.yml --ask-vault-pass --ask-become-pass` inside this directory.

> Note: If some Homebrew commands fail, you might need to agree to Xcode's license or fix some other Brew issue. Run `brew doctor` to see if this is the case.
