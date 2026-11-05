# Autorizar chave de deploy SNOP (uma vez)

No servidor `192.168.1.82`, como `pedro-levorato`:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJTh74p8KA4un3oUk4n+4NIO6RpAJznBjWYYvXrDicA5 snop-deploy@cursor' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Depois, nesta máquina:

```powershell
$env:SNOP_SSH_KEY = "$env:USERPROFILE\.ssh\snop_192_168_1_82"
cd sop-system
python scripts/publish_parity.py
```

Alternativa: senha SSH

```powershell
$env:SNOP_SSH_PASS = 'SUA_SENHA'
python scripts/publish_parity.py
```
