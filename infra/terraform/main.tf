terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

# Le token est lu depuis une variable d'environnement (jamais en dur)
provider "digitalocean" {
  token = var.do_token
}

# Variable pour le token — sera fournie via TF_VAR_do_token
variable "do_token" {
  description = "Token API DigitalOcean"
  type        = string
  sensitive   = true # ne s'affiche jamais dans les logs
}

# La clé SSH à installer sur le serveur
variable "ssh_key_fingerprint" {
  description = "Empreinte de la clé SSH enregistrée chez DigitalOcean"
  type        = string
}

# Le serveur de développement
resource "digitalocean_droplet" "dev" {
  name     = "anime-notif-dev"
  region   = "fra1" # Frankfurt, proche de la France
  size     = "s-1vcpu-2gb" # ~12 $/mois, couvert par les crédits
  image    = "ubuntu-24-04-x64"
  ssh_keys = [var.ssh_key_fingerprint]

  tags = ["anime-notif", "dev"]
}

# Affiche l'IP du serveur créé
output "dev_ip" {
  value       = digitalocean_droplet.dev.ipv4_address
  description = "IP publique du serveur de dev"
}
