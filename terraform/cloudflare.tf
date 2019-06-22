resource "cloudflare_record" "bot" {
    domain  = "hotline.gg"
    name    = "bot"
    type    = "CNAME"
    value   = "baremetal1.vultr.disc.gg"
    proxied = true
}
