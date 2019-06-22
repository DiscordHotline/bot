terraform {
    backend "remote" {
        hostname     = "app.terraform.io"
        organization = "hotline"
        workspaces {
            name = "bot"
        }
    }
}
